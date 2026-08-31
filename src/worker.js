const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });

const bad = (message, status = 400) =>
  json(
    {
      ok: false,
      message,
    },
    status
  );

const enc = new TextEncoder();

/* =========================================================
   SENHAS
========================================================= */

const hex = (buffer) =>
  [...new Uint8Array(buffer)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");

const unhex = (value) => {
  if (!value || value.length % 2 !== 0) {
    return new Uint8Array();
  }

  return new Uint8Array(
    (value.match(/.{1,2}/g) || []).map((x) => parseInt(x, 16))
  );
};

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  /*
   * Número moderado para evitar excesso de CPU no Worker,
   * mantendo PBKDF2 para proteção da senha.
   */
  const iterations = 60000;

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations,
    },
    key,
    256
  );

  return `pbkdf2$${iterations}$${hex(salt)}$${hex(bits)}`;
}

async function verifyPassword(password, stored) {
  try {
    if (!stored || !stored.startsWith("pbkdf2$")) {
      return false;
    }

    const parts = stored.split("$");

    if (parts.length !== 4) {
      return false;
    }

    const [, iterationText, saltHex, hashHex] = parts;

    const iterations = Number(iterationText);

    if (!iterations || !saltHex || !hashHex) {
      return false;
    }

    const salt = unhex(saltHex);

    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      "PBKDF2",
      false,
      ["deriveBits"]
    );

    const bits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt,
        iterations,
      },
      key,
      256
    );

    return hex(bits) === hashHex;
  } catch {
    return false;
  }
}

/* =========================================================
   SESSÃO
========================================================= */

function createToken() {
  return (
    crypto.randomUUID() +
    crypto.randomUUID().replaceAll("-", "")
  );
}

function cookie(name, value, maxAge) {
  return [
    `${name}=${value}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ].join("; ");
}

function parseCookies(req) {
  const cookieHeader = req.headers.get("cookie") || "";

  if (!cookieHeader) return {};

  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((v) => v.trim())
      .filter(Boolean)
      .map((v) => {
        const i = v.indexOf("=");

        if (i === -1) {
          return [v, ""];
        }

        return [
          v.slice(0, i),
          v.slice(i + 1),
        ];
      })
  );
}

/* =========================================================
   UTILIDADES
========================================================= */

async function body(req) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

function cleanEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function cleanText(value) {
  return String(value || "").trim();
}

/* =========================================================
   USUÁRIO ATUAL
========================================================= */

async function currentUser(req, env) {
  if (!env.DB) {
    throw new Error(
      "O binding DB não está disponível no Worker."
    );
  }

  const cookies = parseCookies(req);
  const sessionToken = cookies.session;

  if (!sessionToken) {
    return null;
  }

  const user = await env.DB
    .prepare(`
      SELECT
        u.id,
        u.name,
        u.email,
        u.plan,
        u.role
      FROM sessions s
      INNER JOIN users u
        ON u.id = s.user_id
      WHERE s.token = ?
        AND s.expires_at > datetime('now')
      LIMIT 1
    `)
    .bind(sessionToken)
    .first();

  return user || null;
}

async function requireUser(req, env) {
  const user = await currentUser(req, env);

  if (!user) {
    throw json(
      {
        ok: false,
        message: "Faça login para continuar.",
      },
      401
    );
  }

  return user;
}

async function requireAdmin(req, env) {
  const user = await requireUser(req, env);

  if (user.role !== "admin") {
    throw json(
      {
        ok: false,
        message: "Acesso restrito ao administrador.",
      },
      403
    );
  }

  return user;
}

async function addHistory(
  env,
  userId,
  toolId,
  title
) {
  await env.DB
    .prepare(`
      INSERT INTO history (
        user_id,
        tool_id,
        title
      )
      VALUES (?, ?, ?)
    `)
    .bind(
      userId,
      cleanText(toolId),
      cleanText(title) || cleanText(toolId)
    )
    .run();
}

/* =========================================================
   WORKER
========================================================= */

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const pathname = url.pathname;

    /*
     * Arquivos estáticos.
     */
    if (!pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(req);
    }

    try {
      if (!env.DB) {
        throw new Error(
          "Binding D1 'DB' não encontrado."
        );
      }

      /* =====================================================
         HEALTH CHECK
      ===================================================== */

      if (
        pathname === "/api/health" &&
        req.method === "GET"
      ) {
        return json({
          ok: true,
          service: "Portal Útil",
          database: true,
        });
      }

      /* =====================================================
         CADASTRO
      ===================================================== */

      if (
        pathname === "/api/auth/register" &&
        req.method === "POST"
      ) {
        const b = await body(req);

        const name = cleanText(b.name);
        const email = cleanEmail(b.email);
        const password = String(b.password || "");

        if (name.length < 2) {
          return bad(
            "Informe seu nome corretamente."
          );
        }

        if (
          !email ||
          !email.includes("@") ||
          !email.includes(".")
        ) {
          return bad(
            "Informe um e-mail válido."
          );
        }

        if (password.length < 6) {
          return bad(
            "A senha precisa ter pelo menos 6 caracteres."
          );
        }

        const existingUser = await env.DB
          .prepare(`
            SELECT id
            FROM users
            WHERE email = ?
            LIMIT 1
          `)
          .bind(email)
          .first();

        if (existingUser) {
          return bad(
            "Este e-mail já está cadastrado.",
            409
          );
        }

        const passwordHash =
          await hashPassword(password);

        /*
         * RETURNING id evita depender exclusivamente
         * de meta.last_row_id.
         */
        const createdUser = await env.DB
          .prepare(`
            INSERT INTO users (
              name,
              email,
              password_hash,
              plan,
              role
            )
            VALUES (?, ?, ?, 'free', 'user')
            RETURNING id, name, email, plan, role
          `)
          .bind(
            name,
            email,
            passwordHash
          )
          .first();

        if (!createdUser?.id) {
          throw new Error(
            "O usuário não pôde ser criado no banco."
          );
        }

        const sessionToken = createToken();

        const sessionResult = await env.DB
          .prepare(`
            INSERT INTO sessions (
              token,
              user_id,
              expires_at
            )
            VALUES (
              ?,
              ?,
              datetime('now', '+30 days')
            )
          `)
          .bind(
            sessionToken,
            createdUser.id
          )
          .run();

        if (!sessionResult.success) {
          throw new Error(
            "Não foi possível criar a sessão."
          );
        }

        return json(
          {
            ok: true,
            message: "Conta criada com sucesso.",
            user: {
              id: createdUser.id,
              name: createdUser.name,
              email: createdUser.email,
              plan: createdUser.plan,
              role: createdUser.role,
            },
          },
          201,
          {
            "set-cookie": cookie(
              "session",
              sessionToken,
              2592000
            ),
          }
        );
      }

      /* =====================================================
         LOGIN
      ===================================================== */

      if (
        pathname === "/api/auth/login" &&
        req.method === "POST"
      ) {
        const b = await body(req);

        const email = cleanEmail(b.email);
        const password = String(
          b.password || ""
        );

        if (!email || !password) {
          return bad(
            "Informe seu e-mail e senha."
          );
        }

        const user = await env.DB
          .prepare(`
            SELECT
              id,
              name,
              email,
              plan,
              role,
              password_hash
            FROM users
            WHERE email = ?
            LIMIT 1
          `)
          .bind(email)
          .first();

        if (!user) {
          return bad(
            "E-mail ou senha incorretos.",
            401
          );
        }

        const passwordOK =
          await verifyPassword(
            password,
            user.password_hash
          );

        if (!passwordOK) {
          return bad(
            "E-mail ou senha incorretos.",
            401
          );
        }

        /*
         * Remove sessões antigas expiradas.
         */
        await env.DB
          .prepare(`
            DELETE FROM sessions
            WHERE user_id = ?
              AND expires_at <= datetime('now')
          `)
          .bind(user.id)
          .run();

        const sessionToken = createToken();

        await env.DB
          .prepare(`
            INSERT INTO sessions (
              token,
              user_id,
              expires_at
            )
            VALUES (
              ?,
              ?,
              datetime('now', '+30 days')
            )
          `)
          .bind(
            sessionToken,
            user.id
          )
          .run();

        return json(
          {
            ok: true,
            message: "Login realizado com sucesso.",
            user: {
              id: user.id,
              name: user.name,
              email: user.email,
              plan: user.plan,
              role: user.role,
            },
          },
          200,
          {
            "set-cookie": cookie(
              "session",
              sessionToken,
              2592000
            ),
          }
        );
      }

      /* =====================================================
         LOGOUT
      ===================================================== */

      if (
        pathname === "/api/auth/logout" &&
        req.method === "POST"
      ) {
        const sessionToken =
          parseCookies(req).session;

        if (sessionToken) {
          await env.DB
            .prepare(`
              DELETE FROM sessions
              WHERE token = ?
            `)
            .bind(sessionToken)
            .run();
        }

        return json(
          {
            ok: true,
          },
          200,
          {
            "set-cookie": cookie(
              "session",
              "",
              0
            ),
          }
        );
      }

      /* =====================================================
         USUÁRIO LOGADO
      ===================================================== */

      if (
        pathname === "/api/me" &&
        req.method === "GET"
      ) {
        const user = await currentUser(
          req,
          env
        );

        return json({
          ok: true,
          user: user || null,
        });
      }

      /* =====================================================
         ROTAS ADMINISTRATIVAS
      ===================================================== */

      if (
        pathname === "/api/admin/stats" &&
        req.method === "GET"
      ) {
        await requireAdmin(req, env);

        const users =
          await env.DB
            .prepare(`
              SELECT COUNT(*) AS total
              FROM users
            `)
            .first();

        const premium =
          await env.DB
            .prepare(`
              SELECT COUNT(*) AS total
              FROM users
              WHERE plan = 'premium'
            `)
            .first();

        const free =
          await env.DB
            .prepare(`
              SELECT COUNT(*) AS total
              FROM users
              WHERE plan = 'free'
            `)
            .first();

        const history =
          await env.DB
            .prepare(`
              SELECT COUNT(*) AS total
              FROM history
            `)
            .first();

        return json({
          ok: true,
          stats: {
            users:
              Number(users?.total || 0),
            premium:
              Number(premium?.total || 0),
            free:
              Number(free?.total || 0),
            toolUses:
              Number(history?.total || 0),
          },
        });
      }

      if (
        pathname === "/api/admin/users" &&
        req.method === "GET"
      ) {
        await requireAdmin(req, env);

        const { results } =
          await env.DB
            .prepare(`
              SELECT
                id,
                name,
                email,
                plan,
                role,
                created_at
              FROM users
              ORDER BY id DESC
              LIMIT 500
            `)
            .all();

        return json({
          ok: true,
          users: results || [],
        });
      }

      if (
        pathname ===
          "/api/admin/user/plan" &&
        req.method === "PATCH"
      ) {
        const admin =
          await requireAdmin(req, env);

        const b = await body(req);

        const userId = Number(
          b.userId
        );

        const plan = String(
          b.plan || ""
        );

        if (
          !userId ||
          !["free", "premium"].includes(
            plan
          )
        ) {
          return bad(
            "Usuário ou plano inválido."
          );
        }

        await env.DB
          .prepare(`
            UPDATE users
            SET plan = ?
            WHERE id = ?
          `)
          .bind(plan, userId)
          .run();

        return json({
          ok: true,
          message:
            "Plano atualizado com sucesso.",
          adminId: admin.id,
        });
      }

      if (
        pathname ===
          "/api/admin/user/role" &&
        req.method === "PATCH"
      ) {
        const admin =
          await requireAdmin(req, env);

        const b = await body(req);

        const userId = Number(
          b.userId
        );

        const role = String(
          b.role || ""
        );

        if (
          !userId ||
          !["user", "admin"].includes(role)
        ) {
          return bad(
            "Usuário ou perfil inválido."
          );
        }

        /*
         * O administrador não pode retirar
         * o próprio acesso administrativo.
         */
        if (
          userId === Number(admin.id) &&
          role !== "admin"
        ) {
          return bad(
            "Você não pode remover seu próprio acesso de administrador.",
            400
          );
        }

        await env.DB
          .prepare(`
            UPDATE users
            SET role = ?
            WHERE id = ?
          `)
          .bind(role, userId)
          .run();

        return json({
          ok: true,
          message:
            "Perfil atualizado com sucesso.",
        });
      }

      if (
        pathname ===
          "/api/admin/user/delete" &&
        req.method === "DELETE"
      ) {
        const admin =
          await requireAdmin(req, env);

        const b = await body(req);

        const userId = Number(
          b.userId
        );

        if (!userId) {
          return bad(
            "Usuário inválido."
          );
        }

        if (
          userId === Number(admin.id)
        ) {
          return bad(
            "Você não pode excluir sua própria conta administrativa."
          );
        }

        await env.DB
          .prepare(`
            DELETE FROM users
            WHERE id = ?
          `)
          .bind(userId)
          .run();

        return json({
          ok: true,
          message:
            "Usuário removido com sucesso.",
        });
      }

      /* =====================================================
         TODAS AS ROTAS ABAIXO EXIGEM LOGIN
      ===================================================== */

      const user = await requireUser(
        req,
        env
      );

      /* =====================================================
         FAVORITOS
      ===================================================== */

      if (
        pathname === "/api/favorites"
      ) {
        if (req.method === "GET") {
          const { results } =
            await env.DB
              .prepare(`
                SELECT tool_id
                FROM favorites
                WHERE user_id = ?
                ORDER BY created_at DESC
              `)
              .bind(user.id)
              .all();

          return json({
            ok: true,
            items: (results || []).map(
              (x) => x.tool_id
            ),
          });
        }

        if (req.method === "POST") {
          const b = await body(req);

          const toolId =
            cleanText(b.toolId);

          if (!toolId) {
            return bad(
              "Ferramenta inválida."
            );
          }

          await env.DB
            .prepare(`
              INSERT OR IGNORE INTO favorites (
                user_id,
                tool_id
              )
              VALUES (?, ?)
            `)
            .bind(
              user.id,
              toolId
            )
            .run();

          return json({
            ok: true,
          });
        }

        if (req.method === "DELETE") {
          const b = await body(req);

          await env.DB
            .prepare(`
              DELETE FROM favorites
              WHERE user_id = ?
                AND tool_id = ?
            `)
            .bind(
              user.id,
              cleanText(b.toolId)
            )
            .run();

          return json({
            ok: true,
          });
        }
      }

      /* =====================================================
         HISTÓRICO
      ===================================================== */

      if (
        pathname === "/api/history" &&
        req.method === "GET"
      ) {
        const { results } =
          await env.DB
            .prepare(`
              SELECT
                tool_id,
                title,
                created_at
              FROM history
              WHERE user_id = ?
              ORDER BY id DESC
              LIMIT 30
            `)
            .bind(user.id)
            .all();

        return json({
          ok: true,
          items: results || [],
        });
      }

      if (
        pathname === "/api/history" &&
        req.method === "POST"
      ) {
        const b = await body(req);

        const toolId =
          cleanText(b.toolId);

        if (!toolId) {
          return bad(
            "Ferramenta inválida."
          );
        }

        await addHistory(
          env,
          user.id,
          toolId,
          b.title
        );

        return json({
          ok: true,
        });
      }

      /* =====================================================
         CONTROLE DE GASTOS
      ===================================================== */

      if (
        pathname === "/api/expenses"
      ) {
        if (req.method === "GET") {
          const { results } =
            await env.DB
              .prepare(`
                SELECT
                  id,
                  description,
                  category,
                  amount,
                  expense_date,
                  created_at
                FROM expenses
                WHERE user_id = ?
                ORDER BY
                  expense_date DESC,
                  id DESC
                LIMIT 200
              `)
              .bind(user.id)
              .all();

          return json({
            ok: true,
            items: results || [],
          });
        }

        if (req.method === "POST") {
          const b = await body(req);

          const description =
            cleanText(
              b.description
            );

          const category =
            cleanText(
              b.category
            ) || "Outros";

          const amount =
            Number(b.amount);

          const expenseDate =
            cleanText(
              b.expense_date
            );

          if (
            !description ||
            !Number.isFinite(amount) ||
            amount <= 0 ||
            !expenseDate
          ) {
            return bad(
              "Preencha descrição, valor e data."
            );
          }

          await env.DB
            .prepare(`
              INSERT INTO expenses (
                user_id,
                description,
                category,
                amount,
                expense_date
              )
              VALUES (?, ?, ?, ?, ?)
            `)
            .bind(
              user.id,
              description,
              category,
              amount,
              expenseDate
            )
            .run();

          await addHistory(
            env,
            user.id,
            "gastos",
            "Controle de Gastos"
          );

          return json({
            ok: true,
          });
        }

        if (
          req.method === "DELETE"
        ) {
          const b = await body(req);

          const id = Number(b.id);

          if (!id) {
            return bad(
              "Registro inválido."
            );
          }

          await env.DB
            .prepare(`
              DELETE FROM expenses
              WHERE id = ?
                AND user_id = ?
            `)
            .bind(
              id,
              user.id
            )
            .run();

          return json({
            ok: true,
          });
        }
      }

      /* =====================================================
         CHECKLIST
      ===================================================== */

      if (
        pathname === "/api/checklist"
      ) {
        if (req.method === "GET") {
          const { results } =
            await env.DB
              .prepare(`
                SELECT
                  id,
                  text,
                  done,
                  created_at
                FROM checklist_items
                WHERE user_id = ?
                ORDER BY id DESC
              `)
              .bind(user.id)
              .all();

          return json({
            ok: true,
            items: results || [],
          });
        }

        if (req.method === "POST") {
          const b = await body(req);

          const text =
            cleanText(b.text);

          if (!text) {
            return bad(
              "Digite uma tarefa."
            );
          }

          await env.DB
            .prepare(`
              INSERT INTO checklist_items (
                user_id,
                text
              )
              VALUES (?, ?)
            `)
            .bind(
              user.id,
              text
            )
            .run();

          await addHistory(
            env,
            user.id,
            "checklist",
            "Checklist Diário"
          );

          return json({
            ok: true,
          });
        }

        if (req.method === "PATCH") {
          const b = await body(req);

          const id = Number(b.id);

          if (!id) {
            return bad(
              "Tarefa inválida."
            );
          }

          await env.DB
            .prepare(`
              UPDATE checklist_items
              SET done = ?
              WHERE id = ?
                AND user_id = ?
            `)
            .bind(
              b.done ? 1 : 0,
              id,
              user.id
            )
            .run();

          return json({
            ok: true,
          });
        }

        if (
          req.method === "DELETE"
        ) {
          const b = await body(req);

          const id = Number(b.id);

          if (!id) {
            return bad(
              "Tarefa inválida."
            );
          }

          await env.DB
            .prepare(`
              DELETE FROM checklist_items
              WHERE id = ?
                AND user_id = ?
            `)
            .bind(
              id,
              user.id
            )
            .run();

          return json({
            ok: true,
          });
        }
      }

      return bad(
        "Rota não encontrada.",
        404
      );
    } catch (error) {
      /*
       * Response lançada por requireUser /
       * requireAdmin.
       */
      if (error instanceof Response) {
        return error;
      }

      console.error(
        "PORTAL UTIL ERROR:",
        error
      );

      /*
       * Temporariamente retornamos a mensagem
       * técnica para conseguirmos diagnosticar
       * sem precisar do Observability pago.
       *
       * Depois que tudo estiver funcionando,
       * eu recomendo remover o campo technicalError.
       */
      return json(
        {
          ok: false,
          message:
            "Erro interno do servidor.",
          technicalError:
            error?.message ||
            String(error),
        },
        500
      );
    }
  },
};
