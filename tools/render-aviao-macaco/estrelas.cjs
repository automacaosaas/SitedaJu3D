// GLTF_NM=<node_modules do gltf-transform> node estrelas.cjs [in.glb] [out.glb] — as estrelas das asas do Aviãoscopia assentadas no rebaixo
// delas (06/10/2026). Sem out: só mede. Entrada padrão: o modelo do site (dist/assets/models/aviaoscopia.glb, com a compressão Meshopt).
// No CAD, cada asa tem um rebaixo em forma de estrela (fundo plano, ~2,5 mm de fundura) e a estrela é uma peça à parte que entra nele. Como
// as peças pequenas foram postas à mão em plane.html, a estrela ficou 1,8 mm abaixo do rebaixo e, sem caber nele, parou em cima da asa:
// a ponta de cima do rebaixo aparecia vazia acima dela, como uma sombra. Aqui, para cada asa: o rebaixo é a região da frente do corpo mais
// de 1 mm abaixo do plano da asa em volta (mínimos quadrados, sem o próprio rebaixo), ligada à estrela; a estrela vai para o centro dele
// (o centro de área de um sobre o do outro: a folga fica igual em volta) e desce até o fundo, entrando EMBED mm nele (fundo e base da
// estrela não ficam no mesmo plano). Mede tudo de novo depois e confere que a estrela inteira cabe no rebaixo.
// A saída passa pela mesma compressão do export-glb.cjs (gltf-transform 4.5.1, meshopt --level high --quantize-position 16).
const path=require('path'),fs=require('fs'),os=require('os'),{execFileSync}=require('child_process'),{pathToFileURL}=require('url'),Module=require('module');
const load=Module._load;Module._load=function(r,...a){if(r==='sharp')return new Proxy({},{get(){throw new Error('sharp');}});return load.call(this,r,...a);};
const req=Module.createRequire(path.join(process.env.GLTF_NM,'@gltf-transform','cli','package.json'));
const SITE=path.join(__dirname,'..','..','dist');
const [input=path.join(SITE,'assets','models','aviaoscopia.glb'),out]=process.argv.slice(2);
const MM=122,CELL=.0005,EMBED=.1/MM,STEP=1/MM;   // 1 unidade do GLB = 122 mm; grade de 0,06 mm; rebaixo: mais de 1 mm abaixo da asa
(async()=>{
  const {NodeIO}=req('@gltf-transform/core'),{ALL_EXTENSIONS}=req('@gltf-transform/extensions'),{dequantize,clearNodeTransform}=req('@gltf-transform/functions');
  const {MeshoptDecoder}=await import(pathToFileURL(path.join(SITE,'vendor','libs','meshopt_decoder.module.js')).href);
  await MeshoptDecoder.ready;
  const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
  const doc=await io.read(input);
  // coordenadas do próprio GLB (as do site e dos testes): sem a quantização e com a escala do nó aplicada aos vértices
  await doc.transform(dequantize());for(const node of doc.getRoot().listNodes())if(node.getMesh())clearNodeTransform(node);
  const prims=doc.getRoot().listMeshes()[0].listPrimitives(),byName=n=>prims.find(p=>p.getMaterial().getName()===n);
  const read=prim=>{const a=prim.getAttribute('POSITION'),P=[];for(let i=0;i<a.getCount();i++)P.push(a.getElement(i,[]));return {a,P,I:prim.getIndices().getArray()};};
  const body=read(byName('body')),det=read(byName('details'));
  // as peças de "details": as estrelas (nas asas, abaixo do meio) e as duas metades do capacete do nariz
  const parent=det.P.map((_,i)=>i),find=i=>{while(parent[i]!==i)i=parent[i]=parent[parent[i]];return i;},join=(a,b)=>{a=find(a);b=find(b);if(a!==b)parent[a]=b;};
  const weld=new Map();det.P.forEach((p,i)=>{const k=p.map(v=>Math.round(v*1e5)).join(',');if(weld.has(k))join(i,weld.get(k));else weld.set(k,i);});
  for(let t=0;t<det.I.length;t+=3){join(det.I[t],det.I[t+1]);join(det.I[t],det.I[t+2]);}
  const groups=new Map();det.P.forEach((_,i)=>{const r=find(i);if(!groups.has(r))groups.set(r,[]);groups.get(r).push(i);});
  const mean=(ids,k)=>ids.reduce((s,i)=>s+det.P[i][k],0)/ids.length;
  const stars=[...groups.values()].filter(ids=>Math.abs(mean(ids,0))>.3&&mean(ids,1)<0).sort((a,b)=>mean(a,0)-mean(b,0));
  if(stars.length!==2)throw new Error(`esperava 2 estrelas, achei ${stars.length}`);
  // a superfície mais à frente (maior z) de um conjunto de triângulos, numa grade sobre x, y
  function front(P,I,keep,u0,v0,nu,nv){
    const F=new Float64Array(nu*nv).fill(-Infinity);
    for(let t=0;t<I.length;t+=3){
      if(keep&&!keep.has(I[t]))continue;const [a,b,c]=[P[I[t]],P[I[t+1]],P[I[t+2]]];
      const den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(den)<1e-14)continue;
      const iu0=Math.max(0,Math.ceil((Math.min(a[0],b[0],c[0])-u0)/CELL)),iu1=Math.min(nu-1,Math.floor((Math.max(a[0],b[0],c[0])-u0)/CELL));
      const iv0=Math.max(0,Math.ceil((Math.min(a[1],b[1],c[1])-v0)/CELL)),iv1=Math.min(nv-1,Math.floor((Math.max(a[1],b[1],c[1])-v0)/CELL));
      for(let iu=iu0;iu<=iu1;iu++)for(let iv=iv0;iv<=iv1;iv++){
        const u=u0+iu*CELL,v=v0+iv*CELL,w1=((b[1]-c[1])*(u-c[0])+(c[0]-b[0])*(v-c[1]))/den,w2=((c[1]-a[1])*(u-c[0])+(a[0]-c[0])*(v-c[1]))/den,w3=1-w1-w2;
        if(w1<-1e-9||w2<-1e-9||w3<-1e-9)continue;const z=w1*a[2]+w2*b[2]+w3*c[2];if(z>F[iv*nu+iu])F[iv*nu+iu]=z;
      }
    }
    return F;
  }
  function measure(ids){
    const keep=new Set(ids),xs=ids.map(i=>det.P[i][0]),ys=ids.map(i=>det.P[i][1]);
    const u0=Math.min(...xs)-.03,v0=Math.min(...ys)-.04,nu=Math.ceil((Math.max(...xs)+.03-u0)/CELL)+1,nv=Math.ceil((Math.max(...ys)+.04-v0)/CELL)+1;
    const wing=front(body.P,body.I,null,u0,v0,nu,nv),star=front(det.P,det.I,keep,u0,v0,nu,nv),X=k=>u0+(k%nu)*CELL,Y=k=>v0+Math.floor(k/nu)*CELL;
    // plano da asa: z = c0 + c1·x + c2·y pelos pontos da grade, refeito só com os que ficam perto dele (o rebaixo sai)
    let pts=[];for(let k=0;k<wing.length;k++)if(Number.isFinite(wing[k]))pts.push(k);
    let c=[0,0,0];const plane=k=>c[0]+c[1]*X(k)+c[2]*Y(k);
    for(let pass=0;pass<6;pass++){
      const A=[[0,0,0],[0,0,0],[0,0,0]],r=[0,0,0];for(const k of pts){const t=[1,X(k),Y(k)];for(let i=0;i<3;i++){r[i]+=t[i]*wing[k];for(let j=0;j<3;j++)A[i][j]+=t[i]*t[j];}}
      for(let i=0;i<3;i++){let m=i;for(let j=i+1;j<3;j++)if(Math.abs(A[j][i])>Math.abs(A[m][i]))m=j;[A[i],A[m]]=[A[m],A[i]];[r[i],r[m]]=[r[m],r[i]];for(let j=0;j<3;j++)if(j!==i){const q=A[j][i]/A[i][i];for(let k=i;k<3;k++)A[j][k]-=q*A[i][k];r[j]-=q*r[i];}}
      c=r.map((v,i)=>v/A[i][i]);pts=pts.filter(k=>Math.abs(wing[k]-plane(k))<.6/MM);
    }
    // rebaixo: abaixo do plano da asa, a região ligada ao ponto dele mais perto do centro da estrela
    const low=k=>Number.isFinite(wing[k])&&wing[k]<plane(k)-STEP,inStar=[];for(let k=0;k<star.length;k++)if(Number.isFinite(star[k]))inStar.push(k);
    const sx=inStar.reduce((s,k)=>s+X(k),0)/inStar.length,sy=inStar.reduce((s,k)=>s+Y(k),0)/inStar.length;
    let seed=-1,best=Infinity;for(let k=0;k<wing.length;k++)if(low(k)){const d=(X(k)-sx)**2+(Y(k)-sy)**2;if(d<best){best=d;seed=k;}}
    const pocket=new Uint8Array(wing.length),stack=[seed];pocket[seed]=1;
    while(stack.length){const k=stack.pop(),iu=k%nu,iv=Math.floor(k/nu);for(const [du,dv] of [[1,0],[-1,0],[0,1],[0,-1]]){const a=iu+du,b=iv+dv,q=b*nu+a;if(a>=0&&b>=0&&a<nu&&b<nv&&!pocket[q]&&low(q)){pocket[q]=1;stack.push(q);}}}
    const cells=[];for(let k=0;k<pocket.length;k++)if(pocket[k])cells.push(k);
    const floor=cells.map(k=>wing[k]).sort((a,b)=>a-b)[Math.floor(cells.length/2)];
    const px=cells.reduce((s,k)=>s+X(k),0)/cells.length,py=cells.reduce((s,k)=>s+Y(k),0)/cells.length;
    // a estrela no rebaixo: células dela fora dele e a folga até a parede (distância da borda da estrela até a célula de fora mais perto)
    const outside=inStar.filter(k=>!pocket[k]).length,edge=inStar.filter(k=>{const iu=k%nu,iv=Math.floor(k/nu);return [[1,0],[-1,0],[0,1],[0,-1]].some(([du,dv])=>!Number.isFinite(star[(iv+dv)*nu+iu+du]));});
    const walls=[];for(let k=0;k<pocket.length;k++)if(!pocket[k]){const iu=k%nu,iv=Math.floor(k/nu);if([[1,0],[-1,0],[0,1],[0,-1]].some(([du,dv])=>pocket[(iv+dv)*nu+iu+du]))walls.push(k);}
    const gaps=edge.map(k=>{let m=Infinity;for(const w of walls){const d=(X(k)-X(w))**2+(Y(k)-Y(w))**2;if(d<m)m=d;}return Math.sqrt(m)*MM;}).sort((a,b)=>a-b);
    const zs=ids.map(i=>det.P[i][2]);
    return {centre:[sx,sy],pocket:[px,py],floor,bottom:Math.min(...zs),top:Math.max(...zs),wing:c[0]+c[1]*px+c[2]*py,outside,starCells:inStar.length,pocketCells:cells.length,
      gap:{min:gaps[0],median:gaps[Math.floor(gaps.length/2)],max:gaps[gaps.length-1]}};
  }
  const mm=v=>+(v*MM).toFixed(3),report=(label,m)=>console.log(label,JSON.stringify({estrela:m.centre.map(mm),rebaixo:m.pocket.map(mm),deslocamento:[m.pocket[0]-m.centre[0],m.pocket[1]-m.centre[1]].map(mm),
    fundo:mm(m.floor),asa:mm(m.wing),base:mm(m.bottom),topo:mm(m.top),acima_da_asa:mm(m.top-m.wing),fora_do_rebaixo:m.outside,area:+(m.starCells/m.pocketCells).toFixed(3),
    folga_mm:Object.fromEntries(Object.entries(m.gap).map(([k,v])=>[k,+v.toFixed(2)]))}));
  const before=stars.map(measure);before.forEach((m,i)=>report(i?'direita, antes ':'esquerda, antes',m));
  if(!out)return;
  stars.forEach((ids,s)=>{const m=before[s],d=[m.pocket[0]-m.centre[0],m.pocket[1]-m.centre[1],m.floor-EMBED-m.bottom];for(const i of ids){det.P[i]=det.P[i].map((v,k)=>v+d[k]);det.a.setElement(i,det.P[i]);}});
  const after=stars.map(measure);after.forEach((m,i)=>report(i?'direita, depois ':'esquerda, depois',m));
  for(const m of after)if(m.outside)throw new Error('a estrela não cabe inteira no rebaixo');
  // grava sem compressão e comprime como o export-glb.cjs
  for(const ext of doc.getRoot().listExtensionsUsed())if(ext.extensionName==='EXT_meshopt_compression')ext.dispose();
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'estrelas-')),raw=path.join(tmp,'raw.glb');
  await io.write(raw,doc);
  execFileSync('npx',['-y','@gltf-transform/cli@4.5.1','meshopt',raw,out,'--level','high','--quantize-position','16'],{stdio:['ignore','pipe','pipe'],shell:true});
  fs.rmSync(tmp,{recursive:true,force:true});
  console.log('gravado',out,(fs.statSync(out).size/1024).toFixed(0),'KB');
})().catch(e=>{console.error(e);process.exitCode=1;});
