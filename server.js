// Felt practice casino: zero-dependency backend. Run: node server.js
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const PORT=process.env.PORT||3000,AU=process.env.ADMIN_USER||'admin',AP=process.env.ADMIN_PASS||'admin123',DB=path.join(__dirname,'data.json');
let db={users:{},tx:[],plays:[],seq:1,secret:crypto.randomBytes(24).toString('hex')};
try{db=Object.assign(db,JSON.parse(fs.readFileSync(DB)))}catch{}
const save=()=>{fs.writeFileSync(DB+'.tmp',JSON.stringify(db));fs.renameSync(DB+'.tmp',DB)};save();
const r2=n=>Math.round(n*100)/100,now=()=>new Date().toISOString();
const hmac=b=>crypto.createHmac('sha256',db.secret).update(b).digest('base64url');
const sign=o=>{const b=Buffer.from(JSON.stringify(o)).toString('base64url');return b+'.'+hmac(b)};
const verify=t=>{try{const[b,s]=(t||'').split('.');if(s!==hmac(b))return null;const o=JSON.parse(Buffer.from(b,'base64url'));return o.exp>Date.now()?o:null}catch{return null}};
const send=(res,c,o)=>{res.writeHead(c,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Allow-Methods':'GET,POST,OPTIONS'});res.end(JSON.stringify(o))};
const readBody=req=>new Promise(r=>{let d='';req.on('data',c=>{d+=c;if(d.length>1e4)req.destroy()});req.on('end',()=>{try{r(JSON.parse(d||'{}'))}catch{r({})}})});
const GAMES=['crash','dice','coin','roulette','blackjack','slots','mines'],METH=['Practice card','Practice bank transfer','Practice mobile wallet'];
const addTx=(u,type,amount,method,status)=>{const x={id:db.seq++,u,type,amount,method,status,time:now()};db.tx.push(x);return x};
const stats=u=>{const t=db.tx.filter(x=>x.u==u.username),p=db.plays.filter(x=>x.u==u.username),sum=(a,f)=>r2(a.reduce((s,x)=>s+f(x),0));
return{username:u.username,balance:u.balance,deposited:sum(t.filter(x=>x.type=='deposit'),x=>x.amount),withdrawn:sum(t.filter(x=>x.type=='withdraw'&&x.status=='completed'),x=>x.amount),pending:sum(t.filter(x=>x.status=='pending'),x=>x.amount),wagered:sum(p,x=>x.bet),won:sum(p,x=>x.payout),plays:p.length,logins:u.logins,created:u.created,last:u.last,ip:u.ip,device:u.ua}};

const R=()=>crypto.randomInt(0,2**30)/2**30,RED=[1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36],W=[30,25,20,15,10],PAY=[5,8,15,30,100];
const card=()=>({r:Math.floor(R()*13),s:'♠♥♦♣'[Math.floor(R()*4)]}),val=c=>c.r==0?11:Math.min(10,c.r+1);
const tot=h=>{let s=h.reduce((a,c)=>a+val(c),0),a=h.filter(c=>c.r==0).length;while(s>21&&a){s-=10;a--}return s};
const pick=()=>{let r=R()*100,i=0;while(r>=W[i]){r-=W[i];i++}return i};
const minesMult=(k,m)=>{let x=.97;for(let i=0;i<k;i++)x*=(25-i)/(25-m-i);return x};
function settle(U,game,bet,pay){pay=r2(pay);U.balance=r2(U.balance+pay);db.plays.push({id:db.seq++,u:U.username,game,bet,payout:pay,time:now()});return pay}
function begin(U,bet){bet=r2(+bet);if(!(bet>=1)||bet>1e5)throw'Bet must be between 1 and 100000.';if(bet>U.balance)throw'Not enough balance.';
 if(U.round&&!U.round.cashed)settle(U,U.round.game=='bj'?'blackjack':U.round.game,U.round.bet,0);U.round=null;U.balance=r2(U.balance-bet);return bet}
function bjEnd(U){const r=U.round,p=tot(r.p),d=tot(r.d),pb=p==21&&r.p.length==2,dn=d==21&&r.d.length==2,bt=r.bet;let w;
 if(p>21)w=0;else if(pb&&!dn)w=bt*2.5;else if(pb&&dn)w=bt;else if(dn)w=0;else w=(d>21||p>d)?bt*2:p==d?bt:0;
 const pay=settle(U,'blackjack',bt,w);U.round=null;save();return{p:r.p,d:r.d,payout:pay,balance:U.balance,done:true}}
const lvl=x=>{const xp=Math.floor(x.wagered/10)+x.plays*5,l=Math.floor(Math.sqrt(xp/25))+1;return{xp,level:l,prev:25*(l-1)**2,next:25*l*l}};
const ACH=[['first','First bet','Place your first bet',s=>s.plays>=1],['p50','Regular','Play 50 rounds',s=>s.plays>=50],['p500','Veteran','Play 500 rounds',s=>s.plays>=500],['big','Big win','Win 10x your bet in one round',s=>s.bestMult>=10],['jack','Jackpot','Hit 100x on slots',s=>s.jack],['crash5','Pilot','Cash out above 5x in Crash',s=>s.crash5],['roller','High roller','Place a bet of 500 or more',s=>s.maxBet>=500],['explorer','Explorer','Play all 7 games',s=>s.games>=7],['rich','Stacked','Hold 5000 coins or more',(s,U)=>U.balance>=5000]];
http.createServer(async(req,res)=>{
const p=new URL(req.url,'http://x').pathname,ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',')[0],ua=String(req.headers['user-agent']||'').slice(0,200);
if(req.method=='OPTIONS')return send(res,204,{});
if(!p.startsWith('/api/')){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(fs.readFileSync(path.join(__dirname,'public',p=='/admin'?'admin.html':'index.html')))}
const b=req.method=='POST'?await readBody(req):{},t=verify((req.headers.authorization||'').replace('Bearer ',''));
const U=t&&t.u&&db.users[t.u],err=(c,m)=>send(res,c,{error:m}),ok=o=>send(res,200,o);
try{
if(p=='/api/signup'){const n=String(b.username||'').toLowerCase(),pw=String(b.password||'');
 if(!/^[a-z0-9_]{3,20}$/.test(n))return err(400,'Username: 3-20 letters, numbers or _.');if(pw.length<6)return err(400,'Password must be at least 6 characters.');if(db.users[n])return err(409,'Username already taken.');
 const salt=crypto.randomBytes(16).toString('hex');db.users[n]={username:n,salt,pw:crypto.scryptSync(pw,salt,32).toString('hex'),balance:1000,created:now(),last:now(),logins:1,ip,ua};save();
 return ok({token:sign({u:n,exp:Date.now()+30*864e5}),username:n,balance:1000})}
if(p=='/api/login'){const n=String(b.username||'').toLowerCase(),u=db.users[n];
 if(!u||crypto.scryptSync(String(b.password||''),u.salt,32).toString('hex')!==u.pw)return err(401,'Wrong username or password.');
 u.last=now();u.logins++;u.ip=ip;u.ua=ua;save();return ok({token:sign({u:n,exp:Date.now()+30*864e5}),username:n,balance:u.balance})}
if(p=='/api/admin/login'){if(b.username===AU&&b.password===AP)return ok({token:sign({a:1,exp:Date.now()+12*36e5})});return err(401,'Wrong admin login.')}
if(p.startsWith('/api/admin/')){if(!t||!t.a)return err(401,'Admin login required.');
 if(p=='/api/admin/users')return ok({users:Object.values(db.users).map(stats).reverse()});
 if(p=='/api/admin/tx')return ok({tx:db.tx.slice(-300).reverse()});
 if(p=='/api/admin/plays')return ok({plays:db.plays.slice(-300).reverse()});
 if(p=='/api/admin/withdrawal'){const x=db.tx.find(x=>x.id==b.id&&x.type=='withdraw'&&x.status=='pending');if(!x)return err(404,'No pending withdrawal with that id.');
  if(b.action=='approve')x.status='completed';else if(b.action=='reject'){x.status='rejected';db.users[x.u].balance=r2(db.users[x.u].balance+x.amount)}else return err(400,'Bad action.');save();return ok({tx:x})}
 return err(404,'Not found')}
if(!U)return err(401,'Please log in.');
if(p=='/api/me')return ok({username:U.username,balance:U.balance});
if(p=='/api/tx')return ok({tx:db.tx.filter(x=>x.u==U.username).slice(-50).reverse()});
if(p=='/api/deposit'||p=='/api/withdraw'){const a=r2(+b.amount),m=METH.includes(b.method)?b.method:METH[0],w=p.endsWith('withdraw');
 if(!(a>=10))return err(400,'Minimum amount is 10 coins.');if(!w&&a>1e5)return err(400,'Maximum deposit is 100000 coins.');if(w&&a>U.balance)return err(400,'Not enough balance.');
 U.balance=r2(U.balance+(w?-a:a));addTx(U.username,w?'withdraw':'deposit',a,m,w?'pending':'completed');save();return ok({balance:U.balance})}
if(p=='/api/game/play'){const g=b.game;let f;
 if(g=='dice'){const t=Math.round(+b.target),ov=!!b.over;if(!(t>=5&&t<=95))throw'Bad target.';f=bt=>{const r=Math.floor(R()*10000)/100,c=ov?100-t:t;return{o:{r},pay:(ov?r>t:r<t)?bt*98/c:0}}}
 else if(g=='coin'){const ch=+b.choice;if(ch!==0&&ch!==1)throw'Bad choice.';f=bt=>{const r=R()<.5?0:1;return{o:{r},pay:r===ch?bt*1.96:0}}}
 else if(g=='roulette'){const ty=b.type,num=Math.round(+b.num);if(!['red','black','even','odd','low','high','num'].includes(ty)||(ty=='num'&&!(num>=0&&num<=36)))throw'Bad bet.';
  f=bt=>{const n=Math.floor(R()*37),w=ty=='num'?n==num:n>0&&(ty=='red'?RED.includes(n):ty=='black'?!RED.includes(n):ty=='even'?n%2==0:ty=='odd'?n%2==1:ty=='low'?n<=18:n>=19);return{o:{n},pay:w?bt*(ty=='num'?36:2):0}}}
 else if(g=='slots'){f=bt=>{const s=[pick(),pick(),pick()];let m=0;if(s[0]==s[1]&&s[1]==s[2])m=PAY[s[0]];else if(s.filter(x=>x==0).length==2)m=2;return{o:{s},pay:bt*m}}}
 else throw'Unknown game.';
 const bt=begin(U,b.bet),x=f(bt),pay=settle(U,g,bt,x.pay);save();return ok(Object.assign({payout:pay,balance:U.balance},x.o))}
if(p=='/api/game/crash/start'){const bt=begin(U,b.bet);U.round={game:'crash',bet:bt,cp:Math.min(200,Math.max(1,Math.floor(97/(1-R()))/100)),t0:Date.now(),cashed:0};save();return ok({balance:U.balance})}
if(p.startsWith('/api/game/crash/')){const r=U.round;if(!r||r.game!='crash')return ok({state:'none',balance:U.balance});
 const m=Math.floor(Math.pow(1.12,(Date.now()-r.t0)/1000)*100)/100;
 if(m>=r.cp){if(!r.cashed)settle(U,'crash',r.bet,0);U.round=null;save();return ok({state:'crashed',cp:r.cp,balance:U.balance})}
 if(p.endsWith('cashout')){if(r.cashed)throw'Already cashed out.';r.cashed=m;const pay=settle(U,'crash',r.bet,r.bet*m);save();return ok({state:'flying',m,payout:pay,balance:U.balance})}
 return ok({state:'flying',m})}
if(p=='/api/game/bj/start'){const bt=begin(U,b.bet);U.round={game:'bj',bet:bt,p:[card(),card()],d:[card(),card()]};if(tot(U.round.p)==21)return ok(bjEnd(U));save();return ok({p:U.round.p,d:[U.round.d[0]],balance:U.balance})}
if(p=='/api/game/bj/hit'||p=='/api/game/bj/stand'){const r=U.round;if(!r||r.game!='bj')throw'No active hand.';
 if(p.endsWith('hit')){r.p.push(card());if(tot(r.p)>21)return ok(bjEnd(U));save();return ok({p:r.p,d:[r.d[0]]})}
 while(tot(r.d)<17)r.d.push(card());return ok(bjEnd(U))}
if(p=='/api/game/mines/start'){const m=Math.round(+b.mines);if(![1,3,5,10].includes(m))throw'Bad mine count.';const bt=begin(U,b.bet),set=new Set();while(set.size<m)set.add(Math.floor(R()*25));U.round={game:'mines',bet:bt,m,set:[...set],open:[]};save();return ok({balance:U.balance})}
if(p.startsWith('/api/game/mines/')){const r=U.round;if(!r||r.game!='mines')throw'No active round.';
 if(p.endsWith('reveal')){const i=Math.round(+b.i);if(!(i>=0&&i<25)||r.open.includes(i))throw'Bad tile.';
  if(r.set.includes(i)){settle(U,'mines',r.bet,0);U.round=null;save();return ok({boom:true,mines:r.set,balance:U.balance})}
  r.open.push(i);const k=r.open.length,mu=minesMult(k,r.m);
  if(k==25-r.m){const pay=settle(U,'mines',r.bet,r.bet*mu);U.round=null;save();return ok({k,mult:mu,done:true,payout:pay,balance:U.balance})}
  save();return ok({k,mult:mu})}
 if(p.endsWith('cashout')){if(!r.open.length)throw'Reveal at least one tile first.';const mu=minesMult(r.open.length,r.m),pay=settle(U,'mines',r.bet,r.bet*mu);U.round=null;save();return ok({payout:pay,balance:U.balance})}}
if(p=='/api/leaderboard'){const us=Object.values(db.users).sort((a,c)=>c.balance-a.balance);
 return ok({top:us.slice(0,10).map(u=>({username:u.username,balance:u.balance,level:lvl(stats(u)).level})),
 wins:db.plays.filter(x=>x.payout>x.bet).sort((a,c)=>(c.payout-c.bet)-(a.payout-a.bet)).slice(0,5).map(x=>({username:x.u,game:x.game,profit:r2(x.payout-x.bet),mult:r2(x.payout/x.bet)})),rank:us.findIndex(u=>u.username==U.username)+1})}
if(p=='/api/profile'){const st=stats(U),pl=db.plays.filter(x=>x.u==U.username),S={plays:pl.length,bestMult:Math.max(0,...pl.map(x=>x.payout/x.bet)),jack:pl.some(x=>x.game=='slots'&&x.payout>=x.bet*100),crash5:pl.some(x=>x.game=='crash'&&x.payout>=x.bet*5),maxBet:Math.max(0,...pl.map(x=>x.bet)),games:new Set(pl.map(x=>x.game)).size};
 return ok(Object.assign({username:U.username,balance:U.balance,achievements:ACH.map(a=>({name:a[1],desc:a[2],got:!!a[3](S,U)}))},lvl(st)))}
return err(404,'Not found')}catch(e){if(typeof e=='string')return err(400,e);console.error(e);return err(500,'Server error')}
}).listen(PORT,()=>console.log('Felt running on http://localhost:'+PORT+'  admin: /admin ('+AU+')'));
