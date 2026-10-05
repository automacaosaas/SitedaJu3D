// GLTF_NM=<node_modules do gltf-transform> node crista.cjs in.glb [out.glb] — o Dinossauroscópio com 2 espinhos na crista (04/10/2026: na peça nova saiu o espinho de baixo,
// na nuca, que encostava no nariz de quem usa o retinoscópio). Sem out: só mede (perfil da crista e pele da cabeça).
// A crista é uma faixa estreita (|x| < 0,07) que fecha uma fenda das costas da cabeça e termina embaixo, na nuca; o espinho de baixo é o
// último trecho dela. Ela fica no lugar e só perde a altura: do vale (entre o espinho do meio e o de baixo) até o fim, a borda de cima
// passa a seguir a pele da cabeça (medida dos dois lados da fenda) com a mesma folga do vale, diminuindo até a do fim. Cada vértice
// sobe ou desce pela reta até o centro da cabeça: r' = base + (r - base)·k, o que mantém o topo arredondado. Normais refeitas na região.
// Entrada: o modelo sem compressão que deu o site de 01/10 (work/meshopt-20260930/raw2/dinossauroscopio.glb, 5.217.988 bytes); a saída
// passa pela mesma compressão Meshopt dos outros (work/meshopt-20260930/meshopt-cli-equivalente.cjs) e vira dist/assets/models/.
const path=require('path');const Module=require('module');const {createRequire}=Module;
const load=Module._load;Module._load=function(r,...a){if(r==='sharp')return new Proxy({},{get(){throw new Error('sharp');}});return load.call(this,r,...a);};
const req=createRequire(path.join(process.env.GLTF_NM,'@gltf-transform','cli','package.json'));
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],len=a=>Math.hypot(...a),norm=a=>{const l=len(a)||1;return a.map(v=>v/l);};
const DEPTH=.07,SIDE=.085;   // DEPTH: quanto da faixa, abaixo da borda de cima, entra na compressão; SIDE: onde medir a pele, fora da fenda
(async()=>{
  const {NodeIO}=req('@gltf-transform/core');const {ALL_EXTENSIONS}=req('@gltf-transform/extensions');
  const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);const doc=await io.read(process.argv[2]);const out=process.argv[3];
  const prims=doc.getRoot().listMeshes()[0].listPrimitives();
  const body=prims.find(p=>p.getMaterial().getName()==='body'),det=prims.find(p=>p.getMaterial().getName()==='details');
  const bp=body.getAttribute('POSITION'),bi=body.getIndices().getArray(),B=[];for(let i=0;i<bp.getCount();i++)B.push(bp.getElement(i,[]));
  // centro da cabeça: esfera ajustada (mínimos quadrados) à calota de cima da cabeça
  const cap=B.filter(p=>p[1]>.6&&Math.abs(p[0])<.25);
  const M=Array.from({length:4},()=>[0,0,0,0]),v=[0,0,0,0];
  for(const p of cap){const row=[2*p[0],2*p[1],2*p[2],1],y=dot(p,p);for(let i=0;i<4;i++){v[i]+=row[i]*y;for(let j=0;j<4;j++)M[i][j]+=row[i]*row[j];}}
  for(let i=0;i<4;i++){let m=i;for(let r=i+1;r<4;r++)if(Math.abs(M[r][i])>Math.abs(M[m][i]))m=r;[M[i],M[m]]=[M[m],M[i]];[v[i],v[m]]=[v[m],v[i]];for(let r=0;r<4;r++){if(r===i)continue;const f=M[r][i]/M[i][i];for(let c=i;c<4;c++)M[r][c]-=f*M[i][c];v[r]-=f*v[i];}}
  const C=[v[0]/M[0][0],v[1]/M[1][1],v[2]/M[2][2]];const R=Math.sqrt(v[3]/M[3][3]+dot(C,C));
  console.log('cabeça: centro',C.map(x=>+x.toFixed(4)),'raio',+R.toFixed(4));
  // pele da cabeça no ângulo a (graus no plano y-z; 0 = topo, negativo = para trás e para baixo): o primeiro cruzamento com o corpo
  // a partir do centro, dos dois lados da fenda (x = ±SIDE), em média
  const tris=[];for(let t=0;t<bi.length;t+=3){const a=B[bi[t]],b=B[bi[t+1]],c=B[bi[t+2]];if(Math.max(a[1],b[1],c[1])<C[1]-.45||Math.min(a[2],b[2],c[2])>C[2]+.1||Math.min(Math.abs(a[0]),Math.abs(b[0]),Math.abs(c[0]))>.15)continue;tris.push([a,b,c]);}
  const hit=(o,d)=>{let best=0;for(const [a,b,c] of tris){const e1=sub(b,a),e2=sub(c,a),p=cross(d,e2),de=dot(e1,p);if(Math.abs(de)<1e-12)continue;const s0=sub(o,a),u=dot(s0,p)/de;if(u<0||u>1)continue;const q=cross(s0,e1),w=dot(d,q)/de;if(w<0||u+w>1)continue;const t=dot(e2,q)/de;if(t>.05&&(!best||t<best))best=t;}return best;};
  const skinCache=new Map(),skin=a=>{const k=Math.round(a*2)/2;if(skinCache.has(k))return skinCache.get(k);const r=k*Math.PI/180,d=[0,Math.cos(r),Math.sin(r)];
    const hs=[hit([C[0]-SIDE,C[1],C[2]],d),hit([C[0]+SIDE,C[1],C[2]],d)].filter(Boolean),s=hs.length?hs.reduce((x,y)=>x+y)/hs.length:0;skinCache.set(k,s);return s;};
  // perfil da crista: o maior raio (a partir do centro) em cada grau
  const dp=det.getAttribute('POSITION'),dn=det.getAttribute('NORMAL'),di=det.getIndices().getArray(),n=dp.getCount(),D=[];for(let i=0;i<n;i++)D.push(dp.getElement(i,[]));
  const ang=p=>Math.atan2(p[2]-C[2],p[1]-C[1])*180/Math.PI,crest=p=>p[1]>C[1]-.45&&Math.abs(p[0])<.07;
  const prof=new Map();for(const p of D){if(!crest(p))continue;const b=Math.round(ang(p));prof.set(b,Math.max(prof.get(b)||0,len(sub(p,C))));}
  // o maior raio grau a grau é serrilhado; a compressão usa o perfil alisado (gaussiana de 2 graus), senão sai em faixas
  const ks=[...prof.keys()].sort((a,b)=>a-b),soft=new Map(ks.map(k=>{let s=0,w=0;for(let j=-5;j<=5;j++){const v=prof.get(k+j);if(v===undefined)continue;const g=Math.exp(-j*j/8);s+=g*v;w+=g;}return [k,s/w];}));
  const top=a=>{const f=Math.floor(a),t=a-f;return (soft.get(f)??soft.get(f+1))*(1-t)+(soft.get(f+1)??soft.get(f))*t;};
  const peaks=ks.filter((k,i)=>i>0&&i<ks.length-1&&prof.get(k)>=prof.get(ks[i-1])&&prof.get(k)>=prof.get(ks[i+1])&&prof.get(k)>R+.12);
  const valleys=ks.filter((k,i)=>i>0&&i<ks.length-1&&prof.get(k)<prof.get(ks[i-1])&&prof.get(k)<prof.get(ks[i+1]));
  console.log('picos (graus, raio):',JSON.stringify(peaks.map(k=>[k,+prof.get(k).toFixed(3)])),'vales:',JSON.stringify(valleys.map(k=>[k,+prof.get(k).toFixed(3)])));
  const rows=[];for(let a=ks[0];a<=-20;a+=4)rows.push(`${a}: ${prof.get(a)?.toFixed(3)}/${skin(a).toFixed(3)}`);console.log('crista/pele:',rows.join('  '));
  if(!out)return;
  const low=Math.min(...peaks),mid=Math.min(...peaks.filter(k=>k>low)),A=Math.max(...valleys.filter(k=>k>low&&k<mid)),Bk=ks[0]+1;
  const hA=top(A)-skin(A),hB=top(Bk)-skin(Bk),target=a=>skin(a)+hA+(hB-hA)*(a-A)/(Bk-A);
  console.log(`espinho de baixo ${low}° | do vale ${A}° (folga ${hA.toFixed(3)}) até o fim ${Bk}° (folga ${hB.toFixed(3)})`);
  const moved=new Set();let maxMove=0;
  for(let i=0;i<n;i++){const p=D[i];if(!crest(p))continue;const a=ang(p);if(a>=A||a<Bk)continue;
    const T=top(a),L=Math.min(T,target(a));if(T-L<1e-5)continue;const base=L-DEPTH,r=len(sub(p,C));if(r<=base)continue;
    const r2=base+(r-base)*(L-base)/(T-base),d=norm(sub(p,C));maxMove=Math.max(maxMove,r-r2);D[i]=[C[0]+d[0]*r2,C[1]+d[1]*r2,C[2]+d[2]*r2];moved.add(i);}
  for(const i of moved)dp.setElement(i,D[i]);
  // normais: média das faces em volta (vértices soldados pela posição), nos vértices mexidos e nos vizinhos deles;
  // a ordem dos triângulos pode estar invertida, então a normal nova fica do lado da original
  const key=i=>D[i].map(x=>Math.round(x*1e5)).join(',');
  const touch=new Set(moved);for(let t=0;t<di.length;t+=3)if(moved.has(di[t])||moved.has(di[t+1])||moved.has(di[t+2]))for(let j=0;j<3;j++)touch.add(di[t+j]);
  const acc=new Map();for(let t=0;t<di.length;t+=3){const [a,b,c]=[di[t],di[t+1],di[t+2]];if(!touch.has(a)&&!touch.has(b)&&!touch.has(c))continue;const f=cross(sub(D[b],D[a]),sub(D[c],D[a]));for(const i of [a,b,c]){const k=key(i);const s=acc.get(k)||[0,0,0];acc.set(k,[s[0]+f[0],s[1]+f[1],s[2]+f[2]]);}}
  for(const i of touch){const s=acc.get(key(i));if(!s||!len(s))continue;let nn=norm(s);if(dot(nn,dn.getElement(i,[]))<0)nn=nn.map(x=>-x);dn.setElement(i,nn);}
  console.log('vértices abaixados',moved.size,'normais refeitas',touch.size,'maior descida',+maxMove.toFixed(4));
  await io.write(out,doc);console.log('gravado',out);
})().catch(e=>{console.error(e);process.exit(1);});
