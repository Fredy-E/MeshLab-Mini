(function(root){
function surface(type,segments=32,rings=16){segments=Math.max(3,Math.min(128,Math.floor(segments)));rings=Math.max(2,Math.min(64,Math.floor(rings)));const positions=[],normals=[],indices=[];
for(let j=0;j<=rings;j++)for(let i=0;i<=segments;i++){const u=i/segments*2*Math.PI,v=j/rings;let p,n;
if(type==='sphere'){const t=v*Math.PI;n=[Math.sin(t)*Math.cos(u),Math.cos(t),Math.sin(t)*Math.sin(u)];p=n;}
else if(type==='torus'){const t=v*2*Math.PI;n=[Math.cos(t)*Math.cos(u),Math.sin(t),Math.cos(t)*Math.sin(u)];p=[(1+.34*Math.cos(t))*Math.cos(u),.34*Math.sin(t),(1+.34*Math.cos(t))*Math.sin(u)];}
else if(type==='cylinder'){p=[Math.cos(u),2*v-1,Math.sin(u)];n=[Math.cos(u),0,Math.sin(u)];}
else throw Error('Unknown surface');positions.push(...p);normals.push(...n);}
for(let j=0;j<rings;j++)for(let i=0;i<segments;i++){const a=j*(segments+1)+i,b=a+segments+1;indices.push(a,b,a+1,a+1,b,b+1);}
if(type==='sphere'){for(let i=0;i<indices.length;i+=3){const t=indices[i+1];indices[i+1]=indices[i+2];indices[i+2]=t;}}
if(type==='cylinder'){for(const top of [false,true]){const center=positions.length/3;positions.push(0,top?1:-1,0);normals.push(0,top?1:-1,0);for(let i=0;i<=segments;i++){const u=i/segments*2*Math.PI;positions.push(Math.cos(u),top?1:-1,Math.sin(u));normals.push(0,top?1:-1,0);}for(let i=0;i<segments;i++)top?indices.push(center,center+i+2,center+i+1):indices.push(center,center+i+1,center+i+2);}}
return{positions,normals,indices};}
function obj(mesh){const lines=['# MeshLab Mini procedural export'];for(let i=0;i<mesh.positions.length;i+=3)lines.push('v '+mesh.positions.slice(i,i+3).join(' '));for(let i=0;i<mesh.normals.length;i+=3)lines.push('vn '+mesh.normals.slice(i,i+3).join(' '));for(let i=0;i<mesh.indices.length;i+=3)lines.push('f '+mesh.indices.slice(i,i+3).map(x=>`${x+1}//${x+1}`).join(' '));return lines.join('\n');}
const api={surface,obj};if(typeof module!=='undefined')module.exports=api;else root.MeshGeometry=api;
})(typeof window!=='undefined'?window:globalThis);
