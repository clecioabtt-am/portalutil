const json = (data, status=200, headers={}) => new Response(JSON.stringify(data), {status, headers:{'content-type':'application/json; charset=utf-8', ...headers}});
const bad = (message, status=400) => json({ok:false, message}, status);
const enc = new TextEncoder();
const hex = b => [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
const unhex = s => new Uint8Array((s.match(/.{1,2}/g)||[]).map(x=>parseInt(x,16)));
async function hashPassword(password){
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:120000},key,256);
  return `pbkdf2$120000$${hex(salt)}$${hex(bits)}`;
}
async function verifyPassword(password,stored){
  if(!stored?.startsWith('pbkdf2$')) return false;
  const [,iter,saltHex,hashHex]=stored.split('$');
  const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:unhex(saltHex),iterations:Number(iter)},key,256);
  return hex(bits)===hashHex;
}
function token(){ return crypto.randomUUID()+crypto.randomUUID().replaceAll('-',''); }
function cookie(name, value, maxAge){ return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`; }
function parseCookies(req){ return Object.fromEntries((req.headers.get('cookie')||'').split(';').map(v=>v.trim()).filter(Boolean).map(v=>{const i=v.indexOf('='); return [v.slice(0,i),v.slice(i+1)]})); }
async function body(req){ try{return await req.json()}catch{return {}} }
async function currentUser(req, env){
  const t=parseCookies(req).session; if(!t) return null;
  return await env.DB.prepare(`SELECT u.id,u.name,u.email,u.plan FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at > datetime('now')`).bind(t).first();
}
async function requireUser(req, env){ const u=await currentUser(req,env); if(!u) throw new Response(JSON.stringify({ok:false,message:'Faça login para continuar.'}),{status:401,headers:{'content-type':'application/json'}}); return u; }
async function addHistory(env,userId,toolId,title){ await env.DB.prepare('INSERT INTO history(user_id,tool_id,title) VALUES(?,?,?)').bind(userId,toolId,title||toolId).run(); }
export default { async fetch(req, env){
  const url=new URL(req.url);
  if(!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
  try{
    if(url.pathname==='/api/health') return json({ok:true, service:'Portal Útil'});
    if(url.pathname==='/api/auth/register' && req.method==='POST'){
      const b=await body(req); const name=(b.name||'').trim(), email=(b.email||'').trim().toLowerCase(), password=b.password||'';
      if(name.length<2 || !email.includes('@') || password.length<6) return bad('Informe nome, e-mail válido e senha com pelo menos 6 caracteres.');
      const exists=await env.DB.prepare('SELECT id FROM users WHERE email=?').bind(email).first(); if(exists) return bad('Este e-mail já está cadastrado.',409);
      const r=await env.DB.prepare('INSERT INTO users(name,email,password_hash) VALUES(?,?,?)').bind(name,email,await hashPassword(password)).run();
      const t=token(); await env.DB.prepare("INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,datetime('now','+30 days'))").bind(t,r.meta.last_row_id).run();
      return json({ok:true,user:{id:r.meta.last_row_id,name,email,plan:'free'}},201,{'set-cookie':cookie('session',t,2592000)});
    }
    if(url.pathname==='/api/auth/login' && req.method==='POST'){
      const b=await body(req); const email=(b.email||'').trim().toLowerCase();
      const u=await env.DB.prepare('SELECT id,name,email,plan,password_hash FROM users WHERE email=?').bind(email).first();
      if(!u || !(await verifyPassword(b.password||'',u.password_hash))) return bad('E-mail ou senha incorretos.',401);
      const t=token(); await env.DB.prepare("INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,datetime('now','+30 days'))").bind(t,u.id).run();
      return json({ok:true,user:{id:u.id,name:u.name,email:u.email,plan:u.plan}},200,{'set-cookie':cookie('session',t,2592000)});
    }
    if(url.pathname==='/api/auth/logout' && req.method==='POST'){
      const t=parseCookies(req).session; if(t) await env.DB.prepare('DELETE FROM sessions WHERE token=?').bind(t).run();
      return json({ok:true},200,{'set-cookie':cookie('session','',0)});
    }
    if(url.pathname==='/api/me') { const u=await currentUser(req,env); return json({ok:true,user:u||null}); }
    const user=await requireUser(req,env);
    if(url.pathname==='/api/favorites'){
      if(req.method==='GET'){ const {results}=await env.DB.prepare('SELECT tool_id FROM favorites WHERE user_id=? ORDER BY created_at DESC').bind(user.id).all(); return json({ok:true,items:results.map(x=>x.tool_id)}); }
      if(req.method==='POST'){ const b=await body(req); await env.DB.prepare('INSERT OR IGNORE INTO favorites(user_id,tool_id) VALUES(?,?)').bind(user.id,b.toolId).run(); return json({ok:true}); }
      if(req.method==='DELETE'){ const b=await body(req); await env.DB.prepare('DELETE FROM favorites WHERE user_id=? AND tool_id=?').bind(user.id,b.toolId).run(); return json({ok:true}); }
    }
    if(url.pathname==='/api/history' && req.method==='GET'){
      const {results}=await env.DB.prepare('SELECT tool_id,title,created_at FROM history WHERE user_id=? ORDER BY id DESC LIMIT 30').bind(user.id).all(); return json({ok:true,items:results});
    }
    if(url.pathname==='/api/history' && req.method==='POST'){
      const b=await body(req); await addHistory(env,user.id,b.toolId,b.title); return json({ok:true});
    }
    if(url.pathname==='/api/expenses'){
      if(req.method==='GET'){ const {results}=await env.DB.prepare('SELECT id,description,category,amount,expense_date FROM expenses WHERE user_id=? ORDER BY expense_date DESC,id DESC LIMIT 200').bind(user.id).all(); return json({ok:true,items:results}); }
      if(req.method==='POST'){ const b=await body(req); if(!b.description || !(Number(b.amount)>0) || !b.expense_date) return bad('Preencha descrição, valor e data.'); await env.DB.prepare('INSERT INTO expenses(user_id,description,category,amount,expense_date) VALUES(?,?,?,?,?)').bind(user.id,b.description.trim(),b.category||'Outros',Number(b.amount),b.expense_date).run(); await addHistory(env,user.id,'gastos','Controle de Gastos'); return json({ok:true}); }
      if(req.method==='DELETE'){ const b=await body(req); await env.DB.prepare('DELETE FROM expenses WHERE id=? AND user_id=?').bind(b.id,user.id).run(); return json({ok:true}); }
    }
    if(url.pathname==='/api/checklist'){
      if(req.method==='GET'){ const {results}=await env.DB.prepare('SELECT id,text,done FROM checklist_items WHERE user_id=? ORDER BY id DESC').bind(user.id).all(); return json({ok:true,items:results}); }
      if(req.method==='POST'){ const b=await body(req); if(!b.text?.trim()) return bad('Digite uma tarefa.'); await env.DB.prepare('INSERT INTO checklist_items(user_id,text) VALUES(?,?)').bind(user.id,b.text.trim()).run(); await addHistory(env,user.id,'checklist','Checklist Diário'); return json({ok:true}); }
      if(req.method==='PATCH'){ const b=await body(req); await env.DB.prepare('UPDATE checklist_items SET done=? WHERE id=? AND user_id=?').bind(b.done?1:0,b.id,user.id).run(); return json({ok:true}); }
      if(req.method==='DELETE'){ const b=await body(req); await env.DB.prepare('DELETE FROM checklist_items WHERE id=? AND user_id=?').bind(b.id,user.id).run(); return json({ok:true}); }
    }
    return bad('Rota não encontrada.',404);
  } catch(e){ if(e instanceof Response) return e; console.error(e); return bad('Erro interno.',500); }
}};
