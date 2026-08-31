"use strict";

/* ================================ 0. 基础数学库 ================================ */
const abs=Math.abs, sqrt=Math.sqrt, sin=Math.sin, cos=Math.cos, atan2=Math.atan2, acos=Math.acos, PI=Math.PI;
const D2R=PI/180, R2D=180/PI;
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const mul=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const len=a=>Math.hypot(a[0],a[1],a[2]);
const nrm=a=>{const l=Math.hypot(a[0],a[1],a[2])||1;return[a[0]/l,a[1]/l,a[2]/l];};
const dst=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const cpy=a=>[a[0],a[1],a[2]];
const lerp3=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
const clamp=(v,a,b)=>v<a?a:(v>b?b:v);

function perpOf(a){
  const x=abs(a[0]),y=abs(a[1]),z=abs(a[2]);
  let t=(x<=y&&x<=z)?[1,0,0]:((y<=z)?[0,1,0]:[0,0,1]);
  return nrm(cross(a,t));
}
const qId=()=>[0,0,0,1];
function qNorm(q){const l=Math.hypot(q[0],q[1],q[2],q[3])||1;return[q[0]/l,q[1]/l,q[2]/l,q[3]/l];}
function qMul(a,b){return[
  a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],
  a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],
  a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],
  a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];}
function qAA(ax,an){const h=an*0.5,s=sin(h);return[ax[0]*s,ax[1]*s,ax[2]*s,cos(h)];}
function qM(q){
  const x=q[0],y=q[1],z=q[2],w=q[3];
  const x2=x+x,y2=y+y,z2=z+z,xx=x*x2,xy=x*y2,xz=x*z2,yy=y*y2,yz=y*z2,zz=z*z2,wx=w*x2,wy=w*y2,wz=w*z2;
  return[1-(yy+zz),xy-wz,xz+wy, xy+wz,1-(xx+zz),yz-wx, xz-wy,yz+wx,1-(xx+yy)];
}
const mApply=(M,v)=>[M[0]*v[0]+M[1]*v[1]+M[2]*v[2],M[3]*v[0]+M[4]*v[1]+M[5]*v[2],M[6]*v[0]+M[7]*v[1]+M[8]*v[2]];
function polarQ(A,q,it){
  it=it||16;
  for(let i=0;i<it;i++){
    const R=qM(q);
    const r0=[R[0],R[3],R[6]],r1=[R[1],R[4],R[7]],r2=[R[2],R[5],R[8]];
    const a0=[A[0],A[3],A[6]],a1=[A[1],A[4],A[7]],a2=[A[2],A[5],A[8]];
    const n=add(add(cross(r0,a0),cross(r1,a1)),cross(r2,a2));
    const d=abs(dot(r0,a0)+dot(r1,a1)+dot(r2,a2))+1e-9;
    const om=mul(n,1/d), w=len(om);
    if(w<1e-13)break;
    q=qNorm(qMul(qAA(mul(om,1/w),w),q));
  }
  return q;
}
const fmt=(v,d)=>(v===null||v===undefined||!isFinite(v))?"--":v.toFixed(d===undefined?2:d);
const sfmt=(v,d)=>{const s=fmt(v,d);return(isFinite(v)&&v>0)?"+"+s:s;};
function deepClone(obj){ return JSON.parse(JSON.stringify(obj)); }

