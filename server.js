const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 8099);
const HOST = process.env.HOST || '0.0.0.0';
const API_KEY = process.env.PPAF_API_KEY || 'PPAF-ADMIN-2026';
const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'ppaf-data.json');

const defaultState = {
  products: [], sales: [], expenses: [], debts: [], debtPayments: [],
  settings: { phone:'', email:'', address:'', tax:0, footer:'' },
  staffMembers: [], adminPassword: ''
};

function load(){
  try { return JSON.parse(fs.readFileSync(DATA_FILE,'utf8')); }
  catch { return structuredClone(defaultState); }
}
function save(db){ fs.writeFileSync(DATA_FILE, JSON.stringify(db,null,2)); }
let db = load();
function send(res,status,data){
  const body=JSON.stringify(data);
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'GET,POST,OPTIONS'});
  res.end(body);
}
function body(req){return new Promise((resolve,reject)=>{let s='';req.on('data',c=>s+=c);req.on('end',()=>{try{resolve(s?JSON.parse(s):{})}catch(e){reject(e)}})})}
function authorized(req){return (req.headers.authorization||'') === 'Bearer '+API_KEY;}
function staffFor(identity,password){
  const key=String(identity||'').trim().toLowerCase();
  return db.staffMembers.find(a=>a.active!==false && [a.name,a.phone,a.username].some(v=>String(v||'').trim().toLowerCase()===key) && String(a.password||'')===String(password||''));
}
function safeState(){return db;}

const server=http.createServer(async(req,res)=>{
  if(req.method==='OPTIONS') return send(res,204,{});
  try{
    if(req.method==='GET' && req.url==='/api/health') return send(res,200,{ok:true,service:'PPAF shared server',mode:'internet-ready',serverTime:new Date().toISOString()});

    if(req.method==='GET' && req.url==='/api/config') return send(res,200,{service:'PPAF',sameOrigin:true,offlineStaffSales:true});

    if(req.method==='POST' && req.url==='/api/staff/login'){
      const b=await body(req); const s=staffFor(b.identity,b.password);
      if(!s) return send(res,401,{error:'Invalid staff account'});
      const token=crypto.createHash('sha256').update(s.id+'|'+API_KEY).digest('hex');
      return send(res,200,{id:s.id,staffId:s.id,name:s.name,phone:s.phone||'',username:s.username||'',role:'staff',token,products:db.products});
    }

    if(req.method==='GET' && req.url==='/api/staff/bootstrap'){
      return send(res,200,{products:db.products,serverTime:new Date().toISOString()});
    }

    if(req.method==='POST' && req.url==='/api/staff/sync'){
      const b=await body(req); if(!b.staffId) return send(res,400,{error:'Missing staffId'});
      const staff=db.staffMembers.find(x=>x.id===b.staffId && x.active!==false);
      if(!staff) return send(res,403,{error:'Staff account disabled or missing'});
      const token=crypto.createHash('sha256').update(staff.id+'|'+API_KEY).digest('hex');
      if((req.headers.authorization||'')!=='Bearer '+token) return send(res,401,{error:'Invalid session'});
      const acceptedIds=[];
      for(const tx of (Array.isArray(b.transactions)?b.transactions:[])){
        if(!tx || !tx.id || db.sales.some(x=>x.id===tx.id)) { if(tx?.id) acceptedIds.push(tx.id); continue; }
        const sale={
          id:tx.id, date:tx.createdAt||new Date().toISOString(), createdAt:tx.createdAt||new Date().toISOString(),
          servedBy:staff.name, staffId:staff.id, staffName:staff.name,
          customerName:tx.customer?.name||'', customerPhone:tx.customer?.phone||'',
          payment:tx.payment||'Cash', total:Number(tx.total||0),
          items:Array.isArray(tx.items)?tx.items:[], milling:tx.milling||null,
          source:'staff-mobile'
        };
        db.sales.push(sale);
        for(const item of sale.items){
          const p=db.products.find(p=>p.id===item.productId);
          if(p) p.stock=Number(p.stock||0)-Number(item.qty||0);
        }
        acceptedIds.push(tx.id);
      }
      save(db);
      return send(res,200,{acceptedIds,products:db.products});
    }

    if(req.method==='GET' && req.url==='/api/admin/state'){
      if(!authorized(req)) return send(res,401,{error:'Invalid admin API key'});
      return send(res,200,{db:safeState()});
    }

    if(req.method==='POST' && req.url==='/api/admin/state'){
      if(!authorized(req)) return send(res,401,{error:'Invalid admin API key'});
      const b=await body(req);
      if(!b.db || typeof b.db!=='object') return send(res,400,{error:'Missing db'});
      db={...defaultState,...b.db,settings:{...defaultState.settings,...(b.db.settings||{})}};
      save(db);
      return send(res,200,{ok:true,db:safeState()});
    }

    // Serve the two app files from the same origin so API='/' works naturally.
    if(req.method==='GET'){
      let file=null;
      if(req.url==='/' || req.url==='/admin.html') file=path.join(ROOT,'Partner_Poultry_and_Animal_Feeds_Admin_LINKED.html');
      else if(req.url==='/staff.html') file=path.join(ROOT,'index(1)_LINKED.html');
      if(file && fs.existsSync(file)){
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}); return fs.createReadStream(file).pipe(res);
      }
    }
    send(res,404,{error:'Not found'});
  }catch(e){console.error(e);send(res,500,{error:e.message});}
});
server.listen(PORT,HOST,()=>console.log(`PPAF shared server running on ${HOST}:${PORT}`));
