import * as T from 'three';

// Illustration geometry only. Replace these assemblies with the user's aligned
// manufacturing parts when available, preserving the named material groups.
export function createModel(key,colors){
  const group=new T.Group(); group.name=key;
  const materials={};
  const degreeMaterials=[];
  const material=(name,hex)=>materials[name]??=(new T.MeshStandardMaterial({color:hex,roughness:.42,metalness:0}));
  material('body',colors.body);material('details',colors.details);material('engines',colors.engines||'#efcf59');
  material('black','#11151c');material('peach','#f0bea0');material('white','#fffaf7');material('silver','#bfc8d2').metalness=.55;
  function mesh(geo,mat,pos=[0,0,0],scale=[1,1,1]){const m=new T.Mesh(geo,materials[mat]);m.position.set(...pos);m.scale.set(...scale);m.castShadow=true;m.receiveShadow=true;m.userData.part=mat;group.add(m);return m;}
  function ball(mat,pos,scale){return mesh(new T.SphereGeometry(1,32,24),mat,pos,scale);}
  function solid(shape,mat,depth=.2,z=-.1,bevel=.035){const geo=new T.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSize:bevel,bevelThickness:bevel,bevelSegments:3,curveSegments:24,steps:1});return mesh(geo,mat,[0,0,z]);}
  function curve(points,mat,r=.025){const path=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)));return mesh(new T.TubeGeometry(path,32,r,8,false),mat);}
  function patch(points,mat,z=.16){const s=new T.Shape();s.moveTo(...points[0]);for(const p of points.slice(1))s.lineTo(...p);s.closePath();return solid(s,mat,.025,z,.012);}
  function eye(x,y,z,size=.105){ball('black',[x,y,z],[size,size*1.35,size*.43]);ball('white',[x-.027,y+.043,z+size*.42],[.026,.033,.015]);}
  function rounded(x,y,w,h,r,Path=T.Shape){const s=new Path();s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+h-r);s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);s.lineTo(x+r,y+h);s.quadraticCurveTo(x,y+h,x,y+h-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);return s;}
  if(key==='borboletoscopio'){
    for(const side of [-1,1]){
      const s=new T.Shape();s.moveTo(.31,-1.72);s.bezierCurveTo(.74,-1.91,1.23,-1.72,1.24,-1.25);s.bezierCurveTo(1.26,-.78,.91,-.53,1.15,-.12);s.bezierCurveTo(1.42,.37,1.31,.54,1.35,.88);s.bezierCurveTo(1.58,1.76,1.2,1.94,.8,1.66);s.bezierCurveTo(.61,1.53,.45,1.34,.3,1.25);s.lineTo(.31,-1.72);s.closePath();solid(s,'body').scale.x=side;
      for(const [x,y,rx,ry,a] of [[.79,1.07,.2,.4,.6],[.87,.45,.22,.35,.8],[.82,-.11,.22,.35,.6],[.79,-.86,.2,.36,-.55],[.66,-1.32,.18,.3,-.7]]){
        for(const z of [.15,-.15]){const p=ball('details',[side*x,y,z],[rx,ry,.032]);p.rotation.z=side*a;}
      }
      for(const [x,y,r] of [[1.13,1.43,.065],[1.23,1.24,.045],[.95,1.52,.038],[1.16,.03,.06],[1.18,-.18,.04],[1.01,-1.49,.055],[.83,-1.65,.05],[.5,-1.68,.035]])for(const z of [.155,-.155])ball('details',[side*x,y,z],[r,r,.025]);
      curve([[side*.18,1.56,0],[side*.28,1.92,0],[side*.5,2.19,0]],'body',.047);ball('body',[side*.52,2.22,0],[.115,.16,.085]);
    }
    ball('body',[0,1.48,0],[.45,.38,.22]);ball('peach',[0,1.51,.22],[.34,.29,.11]);eye(-.14,1.57,.326,.073);eye(.14,1.57,.326,.073);
    curve([[-.14,1.4,.33],[0,1.34,.35],[.14,1.4,.33]],'black',.015);
  }else if(key==='dinossauroscopio'){
    const s=new T.Shape();s.moveTo(-.36,-1.78);s.lineTo(-.37,.76);s.quadraticCurveTo(-.35,.91,-.2,.91);s.lineTo(.2,.91);s.quadraticCurveTo(.35,.91,.37,.76);s.lineTo(.36,-1.78);s.quadraticCurveTo(.91,-1.9,.89,-1.29);s.bezierCurveTo(.91,-.9,.64,-.45,.62,.04);s.lineTo(.65,1.15);s.bezierCurveTo(.7,2.15,-.7,2.15,-.65,1.15);s.lineTo(-.62,.04);s.bezierCurveTo(-.64,-.45,-.91,-.9,-.89,-1.29);s.quadraticCurveTo(-.91,-1.9,-.36,-1.78);s.closePath();solid(s,'body',.39,-.2,.06);
    ball('body',[0,1.3,0],[.67,.64,.4]);
    for(const side of [-1,1]){ball('body',[side*.63,-1.35,.07],[.26,.43,.23]);eye(side*.28,1.47,.35,.12);ball('black',[side*.09,1.25,.403],[.025,.021,.011]);
      for(const [dx,y,r] of [[.74,-1.36,.055],[.77,-1.52,.07],[.62,-1.65,.045],[.82,-1.2,.04]])ball('details',[side*dx,y,.254],[r,r,.025]);
    }
    for(const [y,z,angle,size] of [[1.96,-.12,0,.26],[1.72,-.42,.6,.25],[1.34,-.53,1,.23]]){const m=mesh(new T.ConeGeometry(size*.5,size*1.7,24,1), 'details',[0,y,z]);m.rotation.x=-angle;}
    curve([[-.4,1.11,.32],[-.23,1.025,.386],[0,.99,.402],[.23,1.025,.386],[.4,1.11,.32]],'body',.025);
    for(const x of [-.26,-.09,.09,.26])patch([[x-.07,1.025],[x,.9],[x+.07,1.025]],'body',.38);
  }else{
    // A flat, wide stem passage continues through the underside of the frame.
    const s=new T.Shape();s.moveTo(-.21,-1.84);s.lineTo(-.43,-1.84);s.quadraticCurveTo(-.68,-1.84,-.68,-1.57);s.lineTo(-.68,.95);s.bezierCurveTo(-.68,2.2,.68,2.2,.68,.95);s.lineTo(.68,-1.57);s.quadraticCurveTo(.68,-1.84,.43,-1.84);s.lineTo(.21,-1.84);s.lineTo(.21,-1.6);s.lineTo(.36,-1.6);s.quadraticCurveTo(.44,-1.6,.44,-1.48);s.lineTo(.44,.91);s.quadraticCurveTo(.44,1.08,.27,1.08);s.lineTo(-.27,1.08);s.quadraticCurveTo(-.44,1.08,-.44,.91);s.lineTo(-.44,-1.48);s.quadraticCurveTo(-.44,-1.6,-.36,-1.6);s.lineTo(-.21,-1.6);s.closePath();solid(s,'body',.34,-.17,.022);
    // Front/back lips outline the rectangular mouth without filling the vertical channel.
    for(const z of [-.15,.15]){const lip=mesh(new T.BoxGeometry(.42,.065,.085),'body',[0,-1.8075,z]);lip.name='stem-slot-lip';}
    const shoulder=mesh(new T.BoxGeometry(.42,.08,.34),'body',[0,-1.6,0]);shoulder.name='stem-slot-top';
    const rack=rounded(-.437,-1.57,.874,2.65,.08);
    const powers=[['0.5','1','1.5','2','2.5','3','3.5','4'],['5','6','7','8','9','10','12','15']];
    material('lens-rim','#52575e').metalness=.65;
    materials.lens=new T.MeshPhysicalMaterial({color:'#edf6fa',roughness:.08,metalness:0,transparent:true,opacity:.46,side:T.DoubleSide,depthWrite:false});
    for(let column=0;column<2;column++)for(let row=0;row<8;row++){
      const x=column===0?-.177:.177,y=.88-row*.315,r=.127;
      const hole=new T.Path();hole.absarc(x,y,r,0,Math.PI*2,true);rack.holes.push(hole);
      const rim=mesh(new T.TorusGeometry(r+.003,.008,8,40),'lens-rim',[x,y,.045]);rim.name=`lens-rim-${column}-${row}`;
      const lens=mesh(new T.CircleGeometry(r-.008,40),'lens',[x,y,.027]);lens.name=`lens-${column}-${row}`;lens.castShadow=false; lens.userData.diopters=Number(powers[column][row]);
      const canvas=document.createElement('canvas');canvas.width=128;canvas.height=64;
      const ctx=canvas.getContext('2d');ctx.font='600 48px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#fff';ctx.fillText(powers[column][row],64,34);
      const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
      const name=`degree-${column}-${row}`;
      materials[name]=new T.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false});degreeMaterials.push(materials[name]);
      const label=mesh(new T.PlaneGeometry(.15,.105),name,[column===0?-.36:.36,y,.054]);label.name=name;label.castShadow=false;label.receiveShadow=false;
    }
    const insert=solid(rack,'body',.075,-.045,.005);insert.name='sixteen-aperture-rack';
    for(const side of [-1,1]){
      const wing=new T.Shape();wing.moveTo(.63,.33);wing.bezierCurveTo(.99,.06,1.43,-.22,1.43,-.51);wing.quadraticCurveTo(1.4,-.7,.66,-.66);wing.closePath();solid(wing,'body',.14,-.08).scale.x=side;
      const tail=new T.Shape();tail.moveTo(.64,-1.05);tail.quadraticCurveTo(1.18,-1.6,1.04,-1.69);tail.quadraticCurveTo(.89,-1.75,.6,-1.57);tail.closePath();solid(tail,'body',.12,-.1).scale.x=side;
      const pts=[];for(let i=0;i<10;i++){const a=Math.PI/2+i*Math.PI/5;const r=i%2?.095:.2;pts.push([side*(1.02+Math.cos(a)*r),-.4+Math.sin(a)*r]);}patch(pts,'details',.105);
      ball('engines',[side*.88,.24,.07],[.13,.25,.15]);
      const window=rounded(side>0?.07:-.46,1.28,.39,.36,.065);const w=solid(window,'silver',.045,.18,.018);w.rotation.z=-side*.05;
    }
    const cap=new T.Shape();cap.moveTo(-.36,1.88);cap.quadraticCurveTo(0,2.12,.36,1.88);cap.quadraticCurveTo(0,1.96,-.36,1.88);solid(cap,'details',.3,-.15,.025);
  }
  group.traverse(node=>{if(node.isMesh){node.geometry.computeVertexNormals();}});
  function setColors(next){for(const [part,hex] of Object.entries(next))materials[part]?.color.set(hex);const c=materials.body.color,luminance=.2126*c.r+.7152*c.g+.0722*c.b;degreeMaterials.forEach(m=>m.color.set(luminance>.4?'#26303c':'#f5f5ef'));}
  setColors(colors);
  return {group,materials,setColors,dispose(){group.traverse(n=>n.geometry?.dispose());Object.values(materials).forEach(m=>{m.map?.dispose();m.dispose();});}};
}
