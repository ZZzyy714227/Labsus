"use strict";
const TPHYS = (function(){
  const G=9.81, R2D=180/Math.PI, D2R=Math.PI/180;
  const _W="FR,FL,RR,RL".split(",");
  function interp(xs,ys,x,fb){
    if(!xs||xs.length<2)return fb;
    if(x<=xs[0]){const v=ys[0];return (v===null||v===undefined)?fb:v;}
    if(x>=xs[xs.length-1]){const v=ys[ys.length-1];return (v===null||v===undefined)?fb:v;}
    let i=1; while(i<xs.length&&xs[i]<x)i++;
    const y0=ys[i-1],y1=ys[i];
    if(y0===null||y0===undefined||y1===null||y1===undefined)return fb;
    const t=(x-xs[i-1])/((xs[i]-xs[i-1])||1e-9);
    return y0+(y1-y0)*t;
  }
  function lut(l,key,travel,fb){
    if(!l||!l.travel||!l[key])return fb;
    return interp(l.travel,l[key],travel,fb);
  }
  function mfSetup(p){
    const B=(p.By!==undefined?p.By:20), C=(p.Cy!==undefined?p.Cy:1.2),
          E=(p.Ey!==undefined?p.Ey:-0.5), D0=p.Fy0||5250,
          LS=(p.LS!==undefined?p.LS:0.10), FzN=p.FzNom||3500,
          Sh=p.Sh||0, Sv=p.Sv||0;
    return function fy(aRad,fz){
      if(fz<=0)return 0;
      const d=D0*(fz/FzN)*(1-LS*(fz/FzN-1));
      const x=B*aRad+Sh;
      const arg=x-E*(x-Math.atan(x));
      return d*Math.sin(C*Math.atan(arg))+Sv;
    };
  }
  // --- quasi_loads as JS (port of chassis.quasiLoads; rc/kw LUT supplied) ---
  function kwAt(xs,ys,x,k0){
    const v=interp(xs,ys,x,NaN);
    return (v===null||v===undefined||!isFinite(v)||v<=0)?k0:v*1000;
  }
  function quasiLoads(v,gy,gx,aeroN,aeroBias,rc,kw){
    const L=v.wheelbase_mm/1000, mS=v.sprung_mass_kg, mT=v.mass_kg;
    const mUf=v.front.unsprung_kg*2, mUr=v.rear.unsprung_kg*2;
    const fms=v.front.spring_mass_kg, rms=v.rear.spring_mass_kg;
    const b=L*(rms/(fms+rms)), a=L-b;
    const tf=Math.abs(v.front.points.WC[0])*2/1000;
    const tr=Math.abs(v.rear.points.WC[0])*2/1000;
    const huf=v.front.tire_radius/1000, hur=v.rear.tire_radius/1000;
    const hs=v.hs_mm/1000;
    const ay=gy*G, ax=gx*G;
    const zf0=rc.zrc0_f, zr0=rc.zrc0_r;
    const mrf=v.front.motion_ratio||0.75, mrr=v.rear.motion_ratio||0.78;
    const kwf0=v.front.spring_rate*1000*mrf*mrf;
    const kwr0=v.rear.spring_rate*1000*mrr*mrr;
    let zf=zf0/1000, zr=zr0/1000;
    let kf=0.5*kwf0*tf*tf+rc.karb_f, kr=0.5*kwr0*tr*tr+rc.karb_r, kt=kf+kr, roll=0;
    for(let it=0;it<3;it++){
      const hra=zf+(a/L)*(zr-zf), hArm=Math.max(0.05,hs-hra);
      const denom=kt-mS*G*hArm;
      roll=denom>100?(mS*ay*hArm)/denom:0;
      const dtf=roll*Math.abs(v.front.points.WC[0]);
      const dtr=roll*Math.abs(v.rear.points.WC[0]);
      zf=interp(rc.travel,rc.rcF,dtf,zf0)/1000;
      zr=interp(rc.travel,rc.rcR,dtr,zr0)/1000;
      const kfw=(kwAt(kw.travel,kw.kwF,dtf,kwf0)+kwAt(kw.travel,kw.kwF,-dtf,kwf0))/2;
      const krw=(kwAt(kw.travel,kw.kwR,dtr,kwr0)+kwAt(kw.travel,kw.kwR,-dtr,kwr0))/2;
      kf=0.5*kfw*tf*tf+rc.karb_f; kr=0.5*krw*tr*tr+rc.karb_r; kt=kf+kr;
    }
    const hra=zf+(a/L)*(zr-zf), hArm=Math.max(0.05,hs-hra);
    const denom=kt-mS*G*hArm;
    roll=denom>100?(mS*ay*hArm)/denom:0;
    const Fzf0=mS*G*(b/L)+mUf*G+aeroN*aeroBias;
    const Fzr0=mS*G*(a/L)+mUr*G+aeroN*(1-aeroBias);
    const dFuF=mUf*ay*(huf/tf), dFuR=mUr*ay*(hur/tr);
    const dGf=(mS*ay*(b/L))*(zf/tf), dGr=(mS*ay*(a/L))*(zr/tr);
    const dEf=(kf*roll)/tf, dEr=(kr*roll)/tr;
    const df=dFuF+dGf+dEf, dr=dFuR+dGr+dEr;
    const sgn=gy>=0?1:-1;
    const dLon=(mT*ax*(v.hcg_mm/1000))/L;
    const fz={FL:Math.max(0,(Fzf0-dLon)/2-df*sgn),FR:Math.max(0,(Fzf0-dLon)/2+df*sgn),
              RL:Math.max(0,(Fzr0+dLon)/2-dr*sgn),RR:Math.max(0,(Fzr0+dLon)/2+dr*sgn)};
    return {fz:fz, rollDeg:roll*R2D};
  }
  // --- vehicle ---
  function Veh(body,ctx){
    const v=body.vehicle, t=body.tire||{}, pt=body.powertrain||{}, ae=body.aero||{};
    this.v=v; this.pt=pt; this.ae=ae;
    this.mu=(t.Fy0||5250)/(t.FzNom||3500);
    this.Cg=(t.Cg!==undefined?t.Cg:6.0);
    this.Ls=(t.Ls!==undefined?t.Ls:0.35);
    this.fy=mfSetup(t);
    this.L=v.wheelbase_mm/1000;
    const fms=v.front.spring_mass_kg, rms=v.rear.spring_mass_kg;
    this.b=this.L*(rms/(fms+rms)); this.a=this.L-this.b;
    this.hf=Math.abs(v.front.points.WC[0])/1000;
    this.hr_=Math.abs(v.rear.points.WC[0])/1000;
    this.pos={FR:[this.a,+this.hf],FL:[this.a,-this.hf],RR:[-this.b,+this.hr_],RL:[-this.b,-this.hr_]};
    this.iz=body.iz_kg_m2||v.mass_kg*(this.L*this.L+1.6*1.6)/12;
    this.LsT=Math.max(0.3,this.Ls);   /* F-24：σ 地板 0.3m，与 Python max(0.3,Ls) 对齐 */
    this.rollDeg=0; this.pitchDeg=0; this.prevAy=0; this.prevAx=0; this.tNow=0;
    this.alphaLat={FR:0,FL:0,RR:0,RL:0};
    this._aStT={FR:0,FL:0,RR:0,RL:0};   /* F-22：侧偏目标缓存（derivs 只记录不推进） */
    this.lutF=body.kc_luts&&body.kc_luts.front||{};
    this.lutR=body.kc_luts&&body.kc_luts.rear||{};
    this.rc=ctx.rc; this.kw=ctx.kw;
  }
  Veh.prototype._aero=function(vx){
    const kf=this.ae.k_down_f||0.55, kr=this.ae.k_down_r||0.45, kd=this.ae.k_drag||0.35;
    const v2=vx*vx; return [kf*v2,kr*v2,kd*v2];
  };
  Veh.prototype.loads=function(vx){
    const [dnf,dnr]=this._aero(vx);
    return quasiLoads(this.v, this.prevAy/G, this.prevAx/G,
      dnf+dnr, dnf/(dnf+dnr||1), this.rc, this.kw);
  };
  Veh.prototype.steer=function(delta){
    if(Math.abs(delta)<1e-6)return {FR:0,FL:0};
    let R=this.L/Math.tan(delta);
    const sgn=R>0?1:-1; R=Math.abs(R);
    const din=Math.atan(this.L/Math.max(0.5,R-this.hf));
    const dout=Math.atan(this.L/(R+this.hf));
    return sgn>0?{FR:sgn*din,FL:sgn*dout}:{FR:sgn*dout,FL:sgn*din};
  };
  Veh.prototype.force=function(w,vxw,vyw,delta,fz,thr,brk,vx,dt){
    const lut=w==="FR"||w==="FL"?this.lutF:this.lutR;
    const travel=this.rollDeg*D2R*Math.abs(this.pos[w][1])*1000;
    const toeDeg=(lut.travel&&lut.toe)?interp(lut.travel,lut.toe,travel,0):0;
    const camRad=(lut.travel&&lut.cam)?interp(lut.travel,lut.cam,travel,0)*D2R:0;
    const d=delta+toeDeg*D2R;
    const cd=Math.cos(d), sd=Math.sin(d);
    const vwx=vxw*cd+vyw*sd, vwy=-vxw*sd+vyw*cd;
    const spd=Math.hypot(vwx,vwy);
    const ts=this.alphaLat;
    if(spd<0.8||fz<=1){
      this._aStT[w]=ts[w];
      return {fx:0,fy:0,alpha:0,alphaL:ts[w]*R2D,toe:toeDeg,cam:camRad*R2D,fz:fz,muUse:0};
    }
    const aSt=Math.atan2(vwy,Math.max(Math.abs(vwx),0.5));
    this._aStT[w]=aSt;
    const aLat=ts[w];
    const muFz=this.mu*fz;
    let fy=-this.fy(aLat,fz);
    fy+=-this.Cg*camRad*fz;
    let fx=0;
    if(thr>0){
      const tEff=(this.pt.T_max||250)/0.30;
      const pEff=((this.pt.P_kw||80)*1000)/Math.max(0.8,vx);
      const fAvail=Math.min(tEff,pEff)*thr;
      const split=this.pt.drive_split_f||0;
      const share=(w==="RR"||w==="RL")?(1-split):split;
      if(share>0) fx=Math.min(0.75*muFz,fAvail*share)*0.5;
    }
    if(brk>0){
      const spf=("brake_split_f" in this.pt)?this.pt.brake_split_f:0.6;
      const share=w==="FR"||w==="FL"?spf/2:(1-spf)/2;
      fx=-Math.sign(vwx)*Math.min(muFz,brk*share*14000);
    }
    const latAvail=Math.sqrt(Math.max(0,muFz*muFz-fx*fx));
    fy=Math.max(-latAvail,Math.min(latAvail,fy));
    const muUse=Math.min(1,Math.hypot(fx,fy)/Math.max(muFz,1));
    return {fx:fx*cd-fy*sd, fy:fx*sd+fy*cd,
            alpha:aSt*R2D, alphaL:aLat*R2D, toe:toeDeg, cam:camRad*R2D,
            fz:fz, muUse:muUse};
  };
  Veh.prototype.derivs=function(s,delta,thr,brk,dt){
    const vx=s[3],vy=s[4],r=s[5];
    const L=this.loads(vx);
    this._rollSs=L.rollDeg;
    const st=this.steer(delta);
    let Fx=0,Fy=0,Mz=0,camRow={};
    for(const w of _W){
      const lx=this.pos[w][0], ly=this.pos[w][1];
      const vxw=vx-r*ly, vyw=vy+r*lx;
      const fw=this.force(w,vxw,vyw,st[w]||0,L.fz[w],thr,brk,vx,dt);
      Fx+=fw.fx; Fy+=fw.fy; Mz+=lx*fw.fy-ly*fw.fx;
      camRow[w]=fw;
    }
    const [df,,fdr]=this._aero(vx);
    Fx-=fdr;
    const m=this.v.mass_kg;
    const ax=Fx/m+r*vy, ay=Fy/m-r*vx, ar=Mz/this.iz;
    return {d:[0,0,0,ax,ay,ar], diag:camRow};
  };
  Veh.prototype.step=function(s,dt,delta,thr,brk){
    const k1=this.derivs(s,delta,thr,brk,dt);
    const mid=s.slice(); 
    for(let j=3;j<6;j++) mid[j]=Math.max(-90,Math.min(90,s[j]+0.5*dt*k1.d[j]));
    const k2=this.derivs(mid,delta,thr,brk,dt);
    const s2=s.slice();
    for(let j=3;j<6;j++) s2[j]=Math.max(-90,Math.min(90,s[j]+dt*k2.d[j]));
    const psi=s2[2];
    s2[0]+=dt*(s2[3]*Math.cos(psi)-s2[4]*Math.sin(psi));
    s2[1]+=dt*(s2[3]*Math.sin(psi)+s2[4]*Math.cos(psi));
    s2[2]+=dt*s2[5];
    this.prevAx=k2.d[3]-s2[5]*s2[4];
    this.prevAy=k2.d[4]+s2[5]*s2[3];
    this.rollDeg+=(this._rollSs-this.rollDeg)*(dt/0.18);
    const pSs=Math.atan2(this.prevAx,G)*R2D*0.55;
    this.pitchDeg+=(pSs-this.pitchDeg)*(dt/0.25);
    const sig=Math.max(0.3,this.LsT);
    const vxNow=Math.max(s2[3],0);
    for(const w of _W) this.alphaLat[w]+=(this._aStT[w]-this.alphaLat[w])*(1-Math.exp(-dt*vxNow/sig));
    this.tNow+=dt;
    return {s:s2, diag:k2.diag};
  };
  // --- driver (pure pursuit + PI) ---
  function DriverPI(gain){ this.gain=gain; this.ei=0; }
  DriverPI.prototype.call=function(track,s,idx,vT,L,dt){
    const x=s[0],y=s[1],psi=s[2],vx=s[3];
    let best=idx,bd=Infinity;
    for(let k=idx;k<track.length;k++){
      const d=(track[k][0]-x)*(track[k][0]-x)+(track[k][1]-y)*(track[k][1]-y);
      if(d<bd){bd=d;best=k;}
    }
    idx=best;
    const ld=Math.max(4,Math.min(18,3+this.gain*vx));
    let acc=0,la=track[idx];
    for(let k=idx;k<track.length-1;k++){
      const sx=track[k+1][0]-track[k][0], sy=track[k+1][1]-track[k][1];
      const sl=Math.hypot(sx,sy);
      if(acc+sl>=ld&&sl>1e-9){
        const t=(ld-acc)/sl;
        la=[track[k][0]+sx*t, track[k][1]+sy*t]; break;
      }
      acc+=sl; la=track[k+1];
    }
    const dx=la[0]-x, dy=la[1]-y;
    const c=Math.cos(psi), sn=Math.sin(psi);
    const lx=dx*c+dy*sn, ly=-dx*sn+dy*c;
    const al=Math.atan2(ly,Math.max(lx,1));
    const delta=Math.atan2(2*L*Math.sin(al),ld);
    const e=vT-vx;
    this.ei=Math.max(-2,Math.min(2,this.ei+e*(dt||0.05)));
    const thr=Math.max(0,Math.min(1,0.9*e+0.12*this.ei));
    const brk=e<-0.5?Math.max(0,Math.min(1,-0.9*e-0.15)):0;
    return [delta,thr,brk,idx];
  };
  // --- main ---
  function run(body, simCtx){
    const v=body.vehicle;
    const track=(body.track||[]).map(p=>[p.x,p.y]);
    const tgt=(body.track||[]).map(p=>p.target_speed||15);
    if(track.length<2)return {status:"SOLVER_FAILED",warnings:["track < 2 pts"],t:[],trace:[]};
    const L=v.wheelbase_mm/1000;
    const ctx=simCtx||makeSimContext(body);
    const car=new Veh(body,ctx);
    const drv=new DriverPI(body.lookahead_gain!==undefined?body.lookahead_gain:0.9);
    const dt=body.dt||0.01, simT=body.sim_time||25;
    const startV=body.start_speed||5;
    let s=[0,0,0,startV,0,0];
    s[2]=Math.atan2(track[1][1]-track[0][1],track[1][0]-track[0][0]);
    s[0]=track[0][0]; s[1]=track[0][1];
    const nSteps=Math.min(Math.round(simT/dt),60000);
    const keep=Math.max(1,Math.floor(nSteps/1500));
    const ts=[],trace=[];
    let idx=0, finished=false, warnings=[], maxAy=0;
    for(let k=0;k<nSteps;k++){
      const t=k*dt;
      const vT=tgt[Math.min(idx,tgt.length-1)];
      const [delta,thr,brk,nidx]=drv.call(track,s,idx,vT,L,dt);
      idx=nidx;
      let t2=thr, b2=brk;
      if(thr<0.02&&brk<0.02&&Math.abs(vT-s[3])>0.5)t2=0.05;
      const r=car.step(s,dt,delta,t2,b2);
      s=r.s; const diag=r.diag;
      maxAy=Math.max(maxAy,Math.abs(car.prevAy));
      if(k%keep===0||k===nSteps-1){
        const row={x:+s[0].toFixed(3),y:+s[1].toFixed(3),psi:+s[2].toFixed(4),
          vx:+s[3].toFixed(3),vy:+s[4].toFixed(3),r:+s[5].toFixed(4),
          roll:+car.rollDeg.toFixed(3),pitch:+car.pitchDeg.toFixed(3),
          ay:+car.prevAy.toFixed(2),ax:+car.prevAx.toFixed(2),
          delta:+delta.toFixed(4),throttle:+t2.toFixed(2),brake:+b2.toFixed(2)};
        for(const w of _W){
          row["alpha_"+w]=+ (diag[w]?diag[w].alpha:0).toFixed(3);
          row["alphaL_"+w]=+ (diag[w]?diag[w].alphaL:0).toFixed(3);
          row["fz_"+w]=+ (diag[w]?diag[w].fz:0).toFixed(1);
          row["fy_"+w]=+ (diag[w]?diag[w].fy:0).toFixed(1);
          row["fx_"+w]=+ (diag[w]?diag[w].fx:0).toFixed(1);
          row["mu_"+w]=+ (diag[w]?diag[w].muUse:0).toFixed(3);
          row["cam_"+w]=+ (diag[w]?diag[w].cam:0).toFixed(2);
        }
        ts.push(+t.toFixed(4));
        trace.push(row);
      }
      const dxe=s[0]-track[track.length-1][0], dye=s[1]-track[track.length-1][1];
      if(Math.hypot(dxe,dye)<6&&idx>=track.length-3){finished=true;break;}
      if(!isFinite(s[0]+s[1]+s[2]+s[3]+s[4]+s[5])){warnings.push("diverged at t="+t.toFixed(2));break;}
    }
    const N=trace.length;
    let seg=0;
    for(let i=1;i<N;i++)seg+=Math.hypot(trace[i].x-trace[i-1].x,trace[i].y-trace[i-1].y);
    let vMax=0; for(const p of trace)vMax=Math.max(vMax,p.vx);
    let maxSlip=0;
    const npy=Math.min(N,1200);
    for(let i=N-npy;i<N;i++){if(i<0)continue;for(const w of _W)maxSlip=Math.max(maxSlip,Math.abs(trace[i]["alphaL_"+w]||0));}
    return {status:(isFinite(s[0]+s[1]+s[2])?"VALID":"SOLVER_FAILED"),ms:0,
      steps:ts.length,finished:finished,t:ts,trace:trace,
      summary:{path_length_m:+seg.toFixed(1),v_end:+s[3].toFixed(2),
        v_max:+vMax.toFixed(2),max_ay_g:+(maxAy/G).toFixed(3),
        max_slip_deg:+maxSlip.toFixed(2)},warnings:warnings,
      builtin:true};
  }
  function makeSimContext(body){
    const v=body.vehicle;
    const col=(sw,key,f0)=>(sw&&sw.rows&&sw.rows.length>=2)
      ?{travel:sw.rows.map(q=>q.tr),vals:sw.rows.map(q=>{const x=q[key];return (x===null||x===undefined||!isFinite(x))?f0:x;})}
      :{travel:[-90,-60,-30,-15,0,15,30,60,90],vals:[f0,f0,f0,f0,f0,f0,f0,f0,f0]};
    const rF=col(SIM.swF,"rcH",55), rR=col(SIM.swR,"rcH",63);
    const kwF=col(SIM.swF,"kw",(v.front.spring_rate||60)*(v.front.motion_ratio||0.75)**2);
    const kwR=col(SIM.swR,"kw",(v.rear.spring_rate||65)*(v.rear.motion_ratio||0.78)**2);
    const arbK=(ax)=>{const ab=ax.arb||{};const d=ab.d||0;
      if(d<=0.5)return 0;
      const J=Math.PI*Math.pow(d,4)/32;
      const F=ax.points?ax.points.LCA_F:null;
      const B=ax.points?ax.points.LBJ:null;
      if(!F||!B)return 0;
      const t=ab.t||0.55, dy=ab.dy||50, dz=ab.dz||120, G=ab.G||79000;
      const P0=[F[0]+(B[0]-F[0])*t, F[1]+(B[1]-F[1])*t, F[2]+(B[2]-F[2])*t];
      const xa=P0[0], ay=F[1]+dy, az=F[2]+dz;
      const a=ay-P0[1];
      const E0=[xa, ay-a, az];
      const ldl=Math.hypot(E0[0]-P0[0],E0[1]-P0[1],E0[2]-P0[2]);
      const P=[F[0]+(B[0]-F[0])*t, F[1]+(B[1]-F[1])*t, F[2]+(B[2]-F[2])*t];
      const A=ay-P[1], Bz=az-P[2], R=Math.hypot(A,Bz);
      const K=(xa-P[0])**2+A*A+Bz*Bz+a*a-ldl*ldl;
      const c=Math.max(-1,Math.min(1,K/(2*a*R||1e-9)));
      const f0=Math.atan2(Bz,A), sg=Math.atan2(az-P0[2],ay-P0[1])>=0?1:-1;
      const psi=f0-sg*Math.acos(c);
      void [xa, ay, az, E0, P, A, Bz, R, K, c, f0, sg, psi];
      const L=2*xa;
      const kt=G*J/(L||1e-9);
      return kt/(a*a)*0.55*0.55;
    };
    const kf=arbK(v.front), kr=arbK(v.rear);
    const tF=(Math.abs((v.front.points&&v.front.points.WC[0])||750)*2)/1000;
    const tR=(Math.abs((v.rear.points&&v.rear.points.WC[0])||750)*2)/1000;
    return {
      rc:{travel:rF.travel,rcF:rF.vals,rcR:rR.vals,
          zrc0_f:(SIM.mFR&&SIM.mFR.rcH)||55,zrc0_r:(SIM.mRR&&SIM.mRR.rcH)||63,
          karb_f:kf*1000*(tF*tF)/2,karb_r:kr*1000*(tR*tR)/2},
      kw:{travel:kwF.travel,kwF:kwF.vals,kwR:kwR.vals}
    };
  }
  return {run:run, makeSimContext:makeSimContext};
})();

/* ================================ 14b. 赛道瞬态仿真（S3-2 前端闭环） ================================ */
/* 数据链：本面板调校状态 → trackPayload()（复用整车 vehicle + 前端扫掠 K&C 查表）
   → POST /api/v3/chassis/simulate_track (或内置 TPHYS 闭包) → trace 时序 → 回放（俯视轨迹 + 3D 侧倾联动
   + 遥测 HUD）。回放时 simulate() 被 trackStep 接管（roll 来自引擎准静态内核）。 */
const TRK={
  res:null, req:null, mu:5250/3500,
  playing:false, i:0, speed:1.0, active:false, ready:false,
  preset:"skidpad", custom:null
};
const TRACK_PRESETS={
  skidpad:{zh:"FSAE 稳态定圆 R=30m",closed:true,v:12.0,pts:(function(){
    const o=[];for(let k=0;k<64;k++){const t=2*PI*k/64;o.push([30*Math.cos(t),30*Math.sin(t)]);}return o;})()},
  skidpad8:{zh:"FSAE 官方 8字定圆 (双环 R=15m)",closed:true,v:11.0,pts:(function(){
    const o=[];
    for(let k=0;k<48;k++){const t=-PI/2-2*PI*k/48;o.push([+(15+15*Math.cos(t)).toFixed(3),+(15*Math.sin(t)).toFixed(3),11.0]);}
    for(let k=0;k<48;k++){const t=-PI/2+2*PI*k/48;o.push([+(-15-15*Math.cos(t)).toFixed(3),+(15*Math.sin(t)).toFixed(3),11.0]);}
    return o;})()},
  autocross:{zh:"FSAE 官方 Autocross (800m 综合计时)",closed:true,v:0,pts:[
    [0,0,14],[40,0,18],[80,5,16],[110,25,12],[125,55,10],[115,85,11],[95,115,13],[70,140,9],
    [40,145,9],[15,130,12],[-15,105,15],[-45,85,14],[-75,70,11],[-95,45,9],[-85,20,11],
    [-65,0,13],[-40,-15,12],[-15,-15,11]]},
  accel:{zh:"FSAE 官方 75m 加速与制动区",closed:false,v:0,pts:[
    [0,0,0],[10,0,10],[25,0,18],[50,0,26],[75,0,32],[90,0,15],[110,0,0]]},
  slalom:{zh:"FSAE 蛇形绕桩 (30m 桩距)",closed:false,v:13.0,pts:(function(){
    const o=[[0,0]];for(let k=0;k<5;k++)o.push([15+30*k,(k%2?3.6:-3.6)]);o.push([180,0]);return o;})()},
  minigp:{zh:"Mini GP 短道（发卡+S弯）",closed:true,v:0,pts:[
    [0,0,15],[50,0,17],[80,2,13],[95,15,10],[92,35,9],[75,45,10],
    [50,42,13],[35,48,11],[18,42,10],[5,28,9],[0,12,12]]},
  shanghai:{zh:"上海国际赛车场 (F1 SIC 5.45km 全赛道)",closed:true,v:0,pts:[
    [0,0,75],[40,120,80],[80,240,85],[120,360,86],[150,450,75],
    [180,520,64],[235,580,64],[305,585,60],[360,545,55],[370,490,48],[335,450,45],[275,450,38],
    [215,470,28],[185,440,22],[200,400,24],[240,390,30],
    [285,370,35],[345,360,45],[415,365,55],
    [500,380,75],[595,390,80],[685,375,70],[760,330,45],[815,265,25],[815,205,20],[775,175,25],[710,200,35],
    [625,255,46],[545,280,46],[485,265,48],[445,220,55],[430,155,55],[445,85,50],
    [480,25,35],[465,-30,25],[420,-60,30],[395,-95,40],[420,-130,48],[480,-140,65],[570,-140,75],
    [670,-140,65],[755,-130,35],[785,-95,25],[780,-60,35],[810,-40,46],[860,-40,55],[915,-75,60],[935,-145,65],
    [910,-220,68],[840,-275,69],[740,-295,75],[580,-295,82],[380,-295,88],[180,-295,90],[-30,-295,90.5],
    [-240,-295,85],[-430,-295,60],[-550,-295,35],[-605,-280,25],[-625,-245,24],[-600,-210,26],
    [-540,-200,45],[-420,-200,65],[-290,-195,69],[-150,-190,55],[-75,-175,46],[-45,-130,46],[-25,-70,55]
  ]}
};

function trackPayload(){
  const base=chassisPayload();
  const lut=sw=>({travel:sw.rows.map(r=>r.tr),toe:sw.rows.map(r=>r.toe),cam:sw.rows.map(r=>r.cam)});
  let pts,closed=false;
  if(TRK.preset==="custom"&&TRK.custom){pts=TRK.custom;closed=false;}
  else{const P=TRACK_PRESETS[TRK.preset]||TRACK_PRESETS.skidpad;closed=P.closed;
    pts=P.pts.map(p=>({x:p[0],y:p[1],target_speed:(p[2]!==undefined?p[2]:P.v)}));}
  /* F-52（2026-08-30）：trkLook/trkV0 控件可能尚未在 DOM 创建（与 ：4219/:4353 的
     null 防御同款兜底）——此前直接 .value 抛 TypeError 使整条赛道链路死亡。 */
  const ctlVal=(id,dflt)=>{const e=document.getElementById(id);
    if(!e)return dflt;const v=parseFloat(e.value);return Number.isFinite(v)?v:dflt;};
  const body={vehicle:base.vehicle,
    kc_luts:{front:lut(SIM.swF),rear:lut(SIM.swR)},
    track:pts, dt:0.01, sim_time:25.0,
    lookahead_gain:ctlVal("trkLook",0.9),
    start_speed:ctlVal("trkV0",6.0), _closed:closed,
    powertrain:{T_max:ctlVal("ssTq",250),
      P_kw:ctlVal("ssPw",80),
      brake_split_f:ctlVal("ssBrk",60)/100},
    aero:{k_down_f:ctlVal("ssAkf",0.55),
      k_down_r:ctlVal("ssAkr",0.45),
      k_drag:ctlVal("ssAkd",0.35)},
    tire:{Fy0:ctlVal("ssFy0",5250),
      FzNom:ctlVal("ssFzN",3500),
      Ls:ctlVal("ssLs",0.35),
      Cg:ctlVal("ssCg",6.0),
      LS:0.10, By:20, Cy:1.2, Ey:-0.5}};
  /* G31-P10-4：动力工坊定制规格下发——仅当生效 spec 与 legacy-equivalent
     物理不等价时才叠加嵌套字段（PowertrainSpec 继承 PowertrainParams，
     标量键共存；缺省不发 → payload 与旧行为逐字节一致，对拍锚不变）。
     前端专有字段（fricA/fricB/fricC/throttleTau/slipRefRadS/diff/centerDiff）
     由 Python 端 PowertrainSpec extra=ignore 吸收。 */
  if(typeof POWERTRAIN!=="undefined" && POWERTRAIN.spec && !POWERTRAIN.isLegacyEquivalent()){
    const ptSpec=JSON.parse(JSON.stringify(POWERTRAIN.spec));
    body.powertrain.architecture=ptSpec.architecture;
    body.powertrain.drive=ptSpec.drive;
    body.powertrain.splitFront=ptSpec.splitFront;
    if(ptSpec.ice)body.powertrain.ice=ptSpec.ice;
    if(ptSpec.motorF)body.powertrain.motorF=ptSpec.motorF;
    if(ptSpec.motorR)body.powertrain.motorR=ptSpec.motorR;
    if(ptSpec.gearbox)body.powertrain.gearbox=ptSpec.gearbox;
    if(ptSpec.battery)body.powertrain.battery=ptSpec.battery;
  }
  /* G29 轮胎工坊自定义参数注入（base.tire 来自 chassisPayload 的 SIM.userTire） */
  if(base.tire) Object.assign(body.tire, base.tire);
  /* 轮胎实测标定优先（讲义 EP08 数据链）：辨识成功后覆写参数 */
  if(typeof SIM!=="undefined" && SIM.tireCalib){const tc=SIM.tireCalib;
    Object.assign(body.tire,{Fy0:tc.Fy0,FzNom:tc.FzNom,LS:tc.LS,By:tc.By,Cy:tc.Cy});
    if(isFinite(SIM.tireCalibEy))body.tire.Ey=SIM.tireCalibEy;}
  return body;
}
async function trackRun(){
  const btn=document.getElementById("trkRun");if(btn)btn.textContent="仿真中…";
  setTrkStatus(ENG.ok?"赛道瞬态仿真中…（引擎 /api/v3/chassis/simulate_track）":"赛道瞬态仿真中…（内置 JS 物理 TPHYS）",C.txt2);
  try{
    const body=trackPayload();TRK.req=body;
    let res;
    if(ENG.ok){
      const ctl=new AbortController();const to=setTimeout(()=>ctl.abort(),120000);
      const r=await fetch(ENG.url+"/api/v3/chassis/simulate_track",
        {method:"POST",headers:{"Content-Type":"application/json"},
         body:JSON.stringify(body),signal:ctl.signal});
      clearTimeout(to);
      if(!r.ok){const t=await r.text();throw new Error("HTTP "+r.status+" "+t.slice(0,140));}
      res=await r.json();
    }else{
      await new Promise(r=>setTimeout(r,30));
      res=TPHYS.run(body, TPHYS.makeSimContext(body));
      res.ms=0;res.builtin=true;
    }
    if(res.status!=="VALID")throw new Error(res.status+" "+(res.warnings||[]).join(";"));
    TRK.res=res;
    TRK.i=0;TRK.playing=true;TRK.active=true;TRK.ready=true;
    fitTopViewToTrack();
    const sm=TRK.res.summary;
    setTrkStatus((res.builtin?"[内置JS] ":"")+`完成：${sm.path_length_m}m · v_max ${sm.v_max}m/s · max ${sm.max_ay_g}g · ${TRK.res.ms|0}ms`+
      (TRK.res.finished?"（到达终点）":"（限时截止）"),C.ok);
  }catch(err){setTrkStatus("仿真失败："+err.message,C.nodeFix);}
  finally{if(btn)btn.textContent="运行赛道仿真 RUN";}
  syncTrackUI();
}
function trackExit(){TRK.active=false;TRK.playing=false;syncTrackUI();setTrkStatus("已退出回放（恢复本地求解模式）",C.txt3);}

function applyTrackFrame(i){
  const tr=TRK.res.trace;if(!tr||!tr[i])return;
  const row=tr[i],rDeg=row.roll||0;
  const MF=SIM.FR,MR=SIM.RR,NF=SIM.FL,NR=SIM.RL;
  const z0F=MF.n[MF.idx.WC].p0[2],z0R=MR.n[MR.idx.WC].p0[2];
  const rack=clamp((row.delta||0)*R2D/0.5,-20,20);      /* 自行车转角→齿条 mm（显示用近似） */
  driveTo(MF,z0F+travelR(SIM.halfF,rDeg),rack,'front');  SIM.mFR=metrics(MF,'front');
  driveTo(MR,z0R+travelR(SIM.halfR,rDeg),0,'rear');      SIM.mRR=metrics(MR,'rear');
  if(S.show.mirror){
    driveTo(NF,z0F+travelL(SIM.halfF,rDeg),-rack,'front');SIM.mFL=metrics(NF,'front');
    driveTo(NR,z0R+travelL(SIM.halfR,rDeg),0,'rear');     SIM.mRL=metrics(NR,'rear');
  }
  TRK.i=i;renderTrackTelemetry(row,i);
}
function trackStep(dt){
  if(!TRK.res||!TRK.playing)return;
  const n=TRK.res.trace.length;
  const adv=Math.max(1,Math.round(dt*TRK.speed/TRK.res.t[1]||0.01));
  const ni=Math.min(n-1,TRK.i+adv);
  applyTrackFrame(ni);
  if(ni>=n-1){TRK.playing=false;}
  syncTrackUI();
}
function fitTopViewToTrack(){
  const v=VW.find(q=>q.key==="top");if(!v)return;
  let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;
  const acc=p=>{x0=Math.min(x0,p.x*1000);x1=Math.max(x1,p.x*1000);y0=Math.min(y0,p.y*1000);y1=Math.max(y1,p.y*1000);};
  TRK.req.track.forEach(acc);TRK.res.trace.forEach(acc);
  v.cx=(x0+x1)/2;v.cy=(y0+y1)/2;
  v.s=Math.min((v.w-44)/Math.max(1,x1-x0),(v.h-44)/Math.max(1,y1-y0));
}
function drawTrackOverlay(v){
  if(!TRK.res)return;const ctx=v.ctx;
  const W=p=>P2(v,[p[0]*1000,p[1]*1000,0]);
  ctx.setLineDash([9,6]);ctx.strokeStyle=C.dim;ctx.lineWidth=2;ctx.beginPath();
  TRK.req.track.forEach((p,k)=>{const s=W([p.x,p.y]);k?ctx.lineTo(s[0],s[1]):ctx.moveTo(s[0],s[1]);});
  if(TRK.req._closed){const s=W([TRK.req.track[0].x,TRK.req.track[0].y]);ctx.lineTo(s[0],s[1]);}
  ctx.stroke();ctx.setLineDash([]);
  const tr=TRK.res.trace,gRef=2.0;
  for(let k=1;k<=TRK.i;k++){
    const a=tr[k-1],b=tr[k],g=Math.min(1,Math.abs(b.ay)/(gRef*9.81));
    ctx.strokeStyle="hsl("+(120-120*g|0)+",72%,55%)";ctx.lineWidth=1.6;
    const A=W([a.x,a.y]),B=W([b.x,b.y]);
    ctx.beginPath();ctx.moveTo(A[0],A[1]);ctx.lineTo(B[0],B[1]);ctx.stroke();
  }
  const row=tr[TRK.i];if(!row)return;
  const psi=row.psi,L=S.wb,T=Math.abs(S.front.hp.WC[0])+Math.abs(S.rear.hp.WC[0]);
  const c=[row.x*1000,row.y*1000],cp=Math.cos(psi),sp=Math.sin(psi);
  const rot=(dx,dy)=>[c[0]+dx*cp-dy*sp,c[1]+dx*sp+dy*cp,0];
  ctx.strokeStyle=C.node;ctx.lineWidth=2;ctx.beginPath();
  [[L/2,T/2],[-L/2,T/2],[-L/2,-T/2],[L/2,-T/2]].forEach((d,k)=>{
    const q=P2(v,rot(d[0],d[1]));k?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]);});
  ctx.closePath();ctx.stroke();
  const cc=P2(v,rot(L/2,0)),hh=P2(v,rot(L/2+700,0));
  ctx.lineWidth=2.4;ctx.beginPath();ctx.moveTo(cc[0],cc[1]);ctx.lineTo(hh[0],hh[1]);ctx.stroke();
  ctx.fillStyle=C.txt2;ctx.font="9px ui-monospace,monospace";
  const tNow=TRK.res.t[TRK.i]||0;
  ctx.fillText("t="+tNow.toFixed(1)+"s  v="+row.vx.toFixed(1)+"m/s  ay="+(row.ay/9.81).toFixed(2)+"g",10,16);
}
function renderTrackTelemetry(row,i){
  const tr=TRK.res.trace;
  /* G-G 图（ax 数值微分） */
  const gg=document.getElementById("trkGG");
  if(gg){const tArr=TRK.res.t;const dpr=Math.min(2,devicePixelRatio||1),w=gg.clientWidth||200,h=gg.clientHeight||200;
    if(gg.width!==w*dpr){gg.width=w*dpr;gg.height=h*dpr;}
    const ctx=gg.getContext("2d");ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,w,h);ctx.fillStyle=C.bg;ctx.fillRect(0,0,w,h);
    const cx0=w/2,cy0=h/2,sc=Math.min(w,h)/2/(TRK.mu*1.15);
    ctx.strokeStyle=C.grid2;ctx.beginPath();ctx.moveTo(0,cy0);ctx.lineTo(w,cy0);
    ctx.moveTo(cx0,0);ctx.lineTo(cx0,h);ctx.stroke();
    ctx.strokeStyle=C.kp;ctx.setLineDash([4,3]);ctx.beginPath();
    ctx.arc(cx0,cy0,TRK.mu*sc,0,6.2832);ctx.stroke();ctx.setLineDash([]);
    for(let k=1;k<=i;k++){
      const axk=(tr[k].vx-tr[Math.max(0,k-1)].vx)/((tArr[k]-tArr[Math.max(0,k-1)])||0.01)/9.81;
      const ayk=tr[k].ay/9.81;
      ctx.fillStyle="hsla("+(120-120*Math.min(1,Math.hypot(axk,ayk)/TRK.mu))+",70%,55%,.45)";
      ctx.fillRect(cx0+axk*sc-1.2,cy0-ayk*sc-1.2,2.4,2.4);
    }
    const ax=(tr[i].vx-tr[Math.max(0,i-1)].vx)/((tArr[i]-tArr[Math.max(0,i-1)])||0.01)/9.81;
    ctx.fillStyle=C.nodeSel;ctx.beginPath();
    ctx.arc(cx0+ax*sc,cy0-(row.ay/9.81)*sc,3.6,0,6.2832);ctx.fill();
    ctx.fillStyle=C.txt3;ctx.font="8.5px ui-monospace,monospace";
    ctx.fillText("G-G (μ="+TRK.mu.toFixed(2)+")",6,11);}
  /* 四轮载荷柱 */
  const fz=document.getElementById("trkFZ");
  if(fz){const dpr=Math.min(2,devicePixelRatio||1),w=fz.clientWidth||280,h=fz.clientHeight||64;
    if(fz.width!==w*dpr){fz.width=w*dpr;fz.height=h*dpr;}
    const ctx=fz.getContext("2d");ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,w,h);ctx.fillStyle=C.bg;ctx.fillRect(0,0,w,h);
    const ks=["FL","FR","RL","RR"],mx=8000;
    ks.forEach((k,q)=>{
      const v0=Math.max(0,row["fz_"+k]||0),bw=(w-24)/4;
      const bh=v0/mx*(h-18);
      ctx.fillStyle=q<2?C.arb:C.tie;ctx.fillRect(12+q*bw+4,h-12-bh,bw-8,bh);
      ctx.fillStyle=C.txt2;ctx.font="8.5px ui-monospace,monospace";
      ctx.fillText(k,12+q*bw+bw/2-6,h-3);
      ctx.fillText((v0|0)+"",12+q*bw+4,h-16-bh);});}
  /* 三联曲线 */
  const t=TRK.res.t,xr=[t[0],t[t.length-1]||1];
  const mk=(id,title,unit,key,fn)=>{
    const cv=document.getElementById(id);if(!cv)return;
    plotXYMulti(cv,title,unit,[{c:C.strut,pts:tr.map((p,k)=>[t[k],fn?fn(p):(p[key]||0)])}],xr,t[i]);};
  mk("trkC1","车速 SPEED","m/s","vx");
  mk("trkC2","侧向加速度 LAT ACC","m/s²","ay");
  mk("trkC3","转向角 STEER","rad","delta");
}
function syncTrackUI(){
  const pb=document.getElementById("trkPlay"),sc=document.getElementById("trkScrub");
  if(pb)pb.textContent=TRK.playing?"⏸ 暂停":"▶ 播放";
  if(sc&&TRK.res){sc.max=TRK.res.trace.length-1;sc.value=TRK.i;}
}
function setTrkStatus(t,c){const e=document.getElementById("trkStatus");if(e){e.textContent=t;e.style.color=c||C.txt3;}}
function trackCSV(){
  if(!TRK.res){setTrkStatus("先运行一次仿真",C.ela);return;}
  const tr=TRK.res.trace,ks=Object.keys(tr[0]);
  const csv=[ks.join(",")].concat(tr.map(p=>ks.map(k=>p[k]).join(","))).join("\n");
  const a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
  a.download="labsus_telemetry_"+TRK.preset+".csv";a.click();
}
/* ================================================================
   S3-1 Track Stage (2026-08-24 standalone): setup -> engine sim ->
   80% fullscreen stage with follow cams + live friction circles
   ================================================================ */
const STAGE={
  open:false, res:null, req:null, i:0, speed:1.0, playing:false,
  cam:"behind", trace:null, v:null, tMax:1, raf:0, last:0, built:false, loop:true
};
const STAGE_CAMS=[
  ["behind","尾部跟随"],["front","前部跟随"],["threeq","斜45deg跟随"],
  ["top","顶视跟随"],["trackside","固定机位(起点)"]
];
const STAGE_CAM_OFF={
  behind:[0,-13.5,4.4], front:[0,13.5,3.6], threeq:[8.5,-10.5,4.8],
  top:[0.01,-0.02,55.0], trackside:null
};

function _stageOpenSetup(){
  _stageBuild();
  document.getElementById("stageSetup").style.display="block";
  document.getElementById("stageWrap").style.display="none";
  drawStageSetupPreview();
  console.log("STAGE-SETUP-OPENED");
}
function _stageCloseSetup(){
  document.getElementById("stageSetup").style.display="none";
}
function _stageBuild(){
  if(STAGE.built)return; STAGE.built=true;
  const body=document.body;
  const w=document.createElement("div");w.id="stageWrap";
  w.innerHTML=
    '<div id="stageTop">'+
      '<b class="st-bt">LABSUS - 赛道瞬态舞台</b><span class="st-st" id="stStatus">--</span>'+
      '<span class="sp"></span><span class="st-cams" id="stCams"></span>'+
      '<button class="st-btn" id="stPlay">PAUSE</button>'+
      '<select class="st-sel" id="stRate"><option value="0.5">0.5x</option><option value="1" selected>1.0x</option><option value="2">2.0x</option></select>'+
      '<input id="stScrub" type="range" min="0" max="1000" value="0">'+
      '<button class="st-btn danger" id="stExit">X 退出</button>'+
    '</div>'+
    '<div id="stageBody">'+
      '<div id="stageCanvasBox"><canvas id="stageCanvas"></canvas></div>'+
      '<div id="stageSide">'+
        '<div class="ss-t">四轮摩擦圆 TIRE FRICTION CIRCLES</div>'+
        '<div id="fcGrid"></div>'+
        '<div class="ss-t">关键物理 LIVE TELEMETRY</div>'+
        '<div id="telGrid" class="telg"></div>'+
      '</div>'+
    '</div>';
  body.appendChild(w);
  const st=document.createElement("div");st.id="stageSetup";
  st.innerHTML=
    '<div id="ssHead"><b>赛道仿真 - 初始属性设置</b><button class="st-btn danger" id="ssCancel">取消</button></div>'+
    '<div id="ssBody">'+
      '<div class="ss-col">'+
        '<div class="ss-t">赛道图 TRACK</div>'+
        '<div class="selrow"><label>预设</label><select id="ssPreset"></select></div>'+
        '<canvas id="ssPreview" width="320" height="200"></canvas>'+
        '<div class="selrow"><button class="st-btn" id="ssImport">导入 JSON/CSV 路点</button></div>'+
        '<div class="selrow"><label>模拟时长 s</label><input id="ssTime" type="number" value="25" step="1" min="5" max="120"></div>'+
      '</div>'+
      '<div class="ss-col">'+
        '<div class="ss-t">车辆与动力 VEHICLE and POWERTRAIN</div>'+
        '<div class="telg">'+
          '<label>初速 m/s</label><input id="ssV0" type="number" value="6" step="0.5" min="2" max="30">'+
          '<label>预瞄增益</label><input id="ssLook" type="number" value="0.9" step="0.05" min="0.4" max="1.5">'+
          '<label>峰值扭矩 Nm</label><input id="ssTq" type="number" value="250" step="10" min="40" max="800">'+
          '<label>峰值功率 kW</label><input id="ssPw" type="number" value="80" step="5" min="20" max="400">'+
          '<label>前轴制动 %</label><input id="ssBrk" type="number" value="60" step="5" min="0" max="100">'+
        '</div>'+
        '<div class="ss-t">气动 AERO</div>'+
        '<div class="telg">'+
          '<label>前下压 k</label><input id="ssAkf" type="number" value="0.55" step="0.05" min="0" max="4">'+
          '<label>后下压 k</label><input id="ssAkr" type="number" value="0.45" step="0.05" min="0" max="4">'+
          '<label>阻力 k</label><input id="ssAkd" type="number" value="0.35" step="0.05" min="0" max="4">'+
        '</div>'+
        '<div class="ss-t">轮胎 TIRE (MF)</div>'+
        '<div class="telg">'+
          '<label>Fy0 N</label><input id="ssFy0" type="number" value="5250" step="500" min="2000" max="20000">'+
          '<label>FzNom N</label><input id="ssFzN" type="number" value="3500" step="100" min="1000" max="8000">'+
          '<label>松弛长度 m</label><input id="ssLs" type="number" value="0.35" step="0.05" min="0.05" max="1">'+
          '<label>外倾系数 /rad</label><input id="ssCg" type="number" value="6.0" step="0.5" min="0" max="12">'+
        '</div>'+
        '<button class="st-btn go" id="ssGo">开始赛道仿真</button>'+
        '<label style="margin-left:14px;color:#cbd5e1;cursor:pointer"><input type="checkbox" id="ssUseEng"> 使用引擎 (/api/v3)</label>'+
        '<div class="ss-st" id="ssStatus">选择预设或导入路点 - 设置参数 - 开始仿真</div>'+
      '</div>'+
    '</div>';
  body.appendChild(st);
  STAGE.v={cv:document.getElementById("stageCanvas"),w:10,h:10,dpr:1,ctx:null,
    eye:[0,0,40],tgt:[0,0,0],fw:[1,0,0],rt:[0,1,0],up:[0,0,1],dist:40,s:1};
  const cams=document.getElementById("stCams");
  STAGE_CAMS.forEach((a)=>{
    const b=document.createElement("button");b.className="st-btn cam"+(a[0]==="behind"?" on":"");
    b.textContent=a[1];b.dataset.cam=a[0];
    b.onclick=()=>{STAGE.cam=a[0];cams.querySelectorAll(".st-btn").forEach(q=>q.classList.toggle("on",q.dataset.cam===a[0]));};
    cams.appendChild(b);
  });
  const fg=document.getElementById("fcGrid");
  ["FL","FR","RL","RR"].forEach(wv=>{
    const cell=document.createElement("div");cell.className="fc-cell";
    cell.innerHTML="<div class='fc-t'>"+wv+"</div><canvas class='fc-c' width='130' height='130'></canvas>";
    fg.appendChild(cell);
  });
  const tg=document.getElementById("telGrid");
  [["telV","车速 v","m/s"],["telAx","纵向 ax","m/s2"],["telAy","侧向 ay","g"],
   ["telYaw","横摆 yaw","rad/s"],["telRoll","侧倾 roll","deg"],["telPitch","俯仰 pitch","deg"],
   ["telDelta","转向 delta","deg"],["telMuMax","mu 利用率",""],["telThr","油门",""],
   ["telBrk","制动",""],["telSlipMax","松弛滑移 max","deg"],["telDist","时间","s"]].forEach(d=>{
    const g=document.createElement("div");g.className="telg-item";
    g.innerHTML="<span>"+d[1]+" <u>"+d[2]+"</u></span><b id='"+d[0]+"'>--</b>";
    tg.appendChild(g);
  });
  document.getElementById("stExit").onclick=()=>{STAGE.open=false;document.getElementById("stageWrap").style.display="none";_stageCloseSetup();};
  document.getElementById("stPlay").onclick=()=>{STAGE.playing=!STAGE.playing;document.getElementById("stPlay").textContent=STAGE.playing?"PAUSE":"PLAY";};
  document.getElementById("stRate").onchange=e=>{STAGE.speed=parseFloat(e.target.value);};
  document.getElementById("stScrub").oninput=e=>{if(STAGE.res){STAGE.playing=false;STAGE.i=Math.round(parseFloat(e.target.value)/1000*(STAGE.trace.length-1));}};
  document.getElementById("ssCancel").onclick=_stageCloseSetup;
  const pr=document.getElementById("ssPreset");
  Object.keys(TRACK_PRESETS).forEach(k=>{const o=document.createElement("option");o.value=k;o.textContent=TRACK_PRESETS[k].zh;pr.appendChild(o);});
  pr.onchange=()=>drawStageSetupPreview();
  document.getElementById("ssGo").onclick=trackStageRun;
  STAGE.v.ctx=STAGE.v.cv.getContext("2d");
}

function drawStageSetupPreview(){
  const cv=document.getElementById("ssPreview");if(!cv)return;
  const ctx=cv.getContext("2d");const w=cv.width,h=cv.height;
  ctx.clearRect(0,0,w,h);ctx.fillStyle="#0d1016";ctx.fillRect(0,0,w,h);
  const key=document.getElementById("ssPreset").value;
  const P=TRACK_PRESETS[key]||{};const pts=P.pts||[];
  if(!pts.length)return;
  let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;
  pts.forEach(p=>{x0=Math.min(x0,p[0]);x1=Math.max(x1,p[0]);y0=Math.min(y0,p[1]);y1=Math.max(y1,p[1]);});
  const sc=Math.min((w-34)/Math.max(1,x1-x0),(h-34)/Math.max(1,y1-y0));
  const cx=(x0+x1)/2,cy=(y0+y1)/2;
  ctx.strokeStyle="#4697E6";ctx.beginPath();
  pts.forEach((p,k)=>{const X=w/2+(p[0]-cx)*sc,Y=h/2-(p[1]-cy)*sc;k?ctx.lineTo(X,Y):ctx.moveTo(X,Y);});
  if(P.closed)ctx.closePath();
  ctx.stroke();
  ctx.fillStyle="#9AA4B5";ctx.font="9px monospace";
  ctx.fillText(pts.length+" pts  v="+(P.v||"-")+"m/s",8,12);
}
function trackStageRun(){
  _stageBuild();
  const st=document.getElementById("ssStatus");
  const wantEng=document.getElementById("ssUseEng")&&document.getElementById("ssUseEng").checked;
  if(!ENG.ok){
    if(wantEng){st.textContent="引擎未连接 → 请先连接，或取消「使用引擎」改走内置 JS 物理 (TPHYS)";return;}
    st.textContent="引擎未连接 → 内置 JS 物理 (TPHYS) 仿真中…";
  }else{
    st.textContent=wantEng?"仿真中...(引擎 /api/v3/chassis/simulate_track)"
      :"仿真中...(内置 JS 物理 TPHYS：MF 松弛/复合滑移 + 动力/气动包络)";
  }
  const base=chassisPayload();
  const lut=sw=>({travel:sw.rows.map(r=>r.tr),toe:sw.rows.map(r=>r.toe),cam:sw.rows.map(r=>r.cam)});
  const key=document.getElementById("ssPreset").value;
  const PP=TRACK_PRESETS[key]||TRACK_PRESETS.skidpad;
  const pts=PP.pts.map(p=>({x:p[0],y:p[1],target_speed:(p[2]!==undefined?p[2]:PP.v)}));
  const body={vehicle:base.vehicle,
    kc_luts:{front:lut(SIM.swF),rear:lut(SIM.swR)},
    track:pts, dt:0.01,
    sim_time:parseFloat(document.getElementById("ssTime").value)||25,
    lookahead_gain:parseFloat(document.getElementById("ssLook").value)||0.9,
    start_speed:parseFloat(document.getElementById("ssV0").value)||6.0,
    powertrain:{T_max:parseFloat(document.getElementById("ssTq").value)||250,
      P_kw:parseFloat(document.getElementById("ssPw").value)||80,
      brake_split_f:(parseFloat(document.getElementById("ssBrk").value)||60)/100},
    aero:{k_down_f:parseFloat(document.getElementById("ssAkf").value)||0.55,
      k_down_r:parseFloat(document.getElementById("ssAkr").value)||0.45,
      k_drag:parseFloat(document.getElementById("ssAkd").value)||0.35},
    tire:{Fy0:parseFloat(document.getElementById("ssFy0").value)||5250,
      FzNom:parseFloat(document.getElementById("ssFzN").value)||3500,
      Ls:parseFloat(document.getElementById("ssLs").value)||0.35, LS:0.10,
      Cg:parseFloat(document.getElementById("ssCg").value)||6.0}};
  /* G31-P10-4：动力工坊定制规格下发——仅当生效 spec 与 legacy-equivalent
     物理不等价时才叠加嵌套字段（PowertrainSpec 继承 PowertrainParams，
     标量键共存；缺省不发 → payload 与旧行为逐字节一致，对拍锚不变）。
     前端专有字段（fricA/fricB/fricC/throttleTau/slipRefRadS/diff/centerDiff）
     由 Python 端 PowertrainSpec extra=ignore 吸收。 */
  if(typeof POWERTRAIN!=="undefined" && POWERTRAIN.spec && !POWERTRAIN.isLegacyEquivalent()){
    const ptSpec=JSON.parse(JSON.stringify(POWERTRAIN.spec));
    body.powertrain.architecture=ptSpec.architecture;
    body.powertrain.drive=ptSpec.drive;
    body.powertrain.splitFront=ptSpec.splitFront;
    if(ptSpec.ice)body.powertrain.ice=ptSpec.ice;
    if(ptSpec.motorF)body.powertrain.motorF=ptSpec.motorF;
    if(ptSpec.motorR)body.powertrain.motorR=ptSpec.motorR;
    if(ptSpec.gearbox)body.powertrain.gearbox=ptSpec.gearbox;
    if(ptSpec.battery)body.powertrain.battery=ptSpec.battery;
  }
  /* 轮胎实测标定优先（讲义 EP08 数据链）：辨识成功后覆写舞台胎参数 */
  if(SIM.tireCalib){const tc=SIM.tireCalib;
    Object.assign(body.tire,{Fy0:tc.Fy0,FzNom:tc.FzNom,LS:tc.LS,By:tc.By,Cy:tc.Cy});
    if(isFinite(SIM.tireCalibEy))body.tire.Ey=SIM.tireCalibEy;}
  const useEng=document.getElementById("ssUseEng")&&document.getElementById("ssUseEng").checked&&ENG.ok;
  const finishStage=function(res){
    if(res.status!=="VALID"){document.getElementById("ssStatus").textContent="仿真失败："+res.status;return;}
    STAGE.res=res;STAGE.trace=res.trace;STAGE.req=body;
    STAGE.tMax=res.t[res.t.length-1]||1;
    STAGE.open=true;STAGE.i=0;STAGE.playing=true;STAGE.scene=null;STAGE.mf=0;
    document.getElementById("stageSetup").style.display="none";
    document.getElementById("stageWrap").style.display="block";
    _stageSize();_stageOpen();STAGE.last=performance.now();requestAnimationFrame(stageTick);
    const sm=res.summary;
    document.getElementById("stStatus").textContent=
      (res.builtin?"[内置JS] ":"")+sm.path_length_m+"m - v_max "+sm.v_max+"m/s - max "+sm.max_ay_g+"g - "+(res.ms|0)+"ms"+(res.finished?" (完赛)":"");
  };
  if(useEng){
    const ctl=new AbortController();const to=setTimeout(()=>ctl.abort(),120000);
    fetch(ENG.url+"/api/v3/chassis/simulate_track",
      {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal:ctl.signal})
    .then(r=>{clearTimeout(to);if(!r.ok)throw new Error("HTTP "+r.status);return r.json();})
    .then(res=>{finishStage(res);})
    .catch(err=>{clearTimeout(to);document.getElementById("ssStatus").textContent="仿真失败："+err.message;});
  }else{
    setTimeout(function(){
      const res=TPHYS.run(body, TPHYS.makeSimContext(body));
      res.ms=0;res.builtin=true;
      finishStage(res);
    },30);
  }
}
function _stageUpdateModel(row){
  const rDeg=row.roll||0;
  const z0F=SIM.FR.n[SIM.FR.idx.WC].p0[2],z0R=SIM.RR.n[SIM.RR.idx.WC].p0[2];
  const rack=clamp((row.delta||0)*57.2958/0.5,-20,20);
  driveTo(SIM.FR,z0F+travelR(SIM.halfF,rDeg),rack,'front');SIM.mFR=metrics(SIM.FR,'front');
  driveTo(SIM.RR,z0R+travelR(SIM.halfR,rDeg),0,'rear');SIM.mRR=metrics(SIM.RR,'rear');
  if(S.show.mirror){
    driveTo(SIM.FL,z0F+travelL(SIM.halfF,rDeg),-rack,'front');SIM.mFL=metrics(SIM.FL,'front');
    driveTo(SIM.RL,z0R+travelL(SIM.halfR,rDeg),0,'rear');SIM.mRL=metrics(SIM.RL,'rear');
  }
  STAGE.scene=null;
}
function _stageSize(){
  const v=STAGE.v,cv=v.cv,r=cv.getBoundingClientRect();
  const dpr=Math.min(2,window.devicePixelRatio||1);
  v.w=Math.max(10,r.width);v.h=Math.max(10,r.height);v.dpr=dpr;
  cv.width=v.w*dpr;cv.height=v.h*dpr;v.ctx.setTransform(dpr,0,0,dpr,0,0);
}
function _stageOpen(){
  if(STAGE.trace&&STAGE.trace.length)stageCam(STAGE.trace[STAGE.i]);
}
function stageCam(row){
  const v=STAGE.v;if(!row)return;
  const psi=row.psi,x=row.x,y=row.y;
  const off=STAGE_CAM_OFF[STAGE.cam];
  let eye,tgt;
  if(STAGE.cam==="trackside"){
    const P=TRACK_PRESETS[document.getElementById("ssPreset").value]||{pts:[[0,0]]};
    const p0=P.pts[0];
    eye=[(p0[0]||0)+16,(p0[1]||0)-14,9];
    tgt=[x,y,0.6];
  }else{
    const c=Math.cos(psi),sn=Math.sin(psi);
    const hx=c,hy=sn,rx=sn,ry=-c;
    eye=[x+rx*off[0]+hx*off[1], y+ry*off[0]+hy*off[1], off[2]];
    tgt=[x,y,0.5];
  }
  const k=0.22;
  v.eye=[v.eye[0]+(eye[0]-v.eye[0])*k,v.eye[1]+(eye[1]-v.eye[1])*k,v.eye[2]+(eye[2]-v.eye[2])*k];
  v.tgt=[v.tgt[0]+(tgt[0]-v.tgt[0])*k,v.tgt[1]+(tgt[1]-v.tgt[1])*k,v.tgt[2]+(tgt[2]-v.tgt[2])*k];
  // inline camera basis (camIso needs az/elv which stage-cam object lacks)
  v.dist=Math.max(2,Math.hypot(v.eye[0]-v.tgt[0],v.eye[1]-v.tgt[1],v.eye[2]-v.tgt[2]));
  v.s=Math.min(0.9, 140/v.dist);
  const fw=[v.tgt[0]-v.eye[0],v.tgt[1]-v.eye[1],v.tgt[2]-v.eye[2]];
  const fl=Math.hypot(fw[0],fw[1],fw[2])||1;
  v.fw=[fw[0]/fl,fw[1]/fl,fw[2]/fl];
  let rt=[v.fw[1],-v.fw[0],0.0001];
  const rl=Math.hypot(rt[0],rt[1])||1e-6;
  v.rt=[rt[0]/rl,rt[1]/rl,0];
  v.up=[v.rt[1]*v.fw[2]-v.rt[2]*v.fw[1], v.rt[2]*v.fw[0]-v.rt[0]*v.fw[2], v.rt[0]*v.fw[1]-v.rt[1]*v.fw[0]];
}
function stageTick(ts){
  if(!STAGE.open)return;
  const dt=(ts-STAGE.last)/1000;STAGE.last=ts;
  const row0=STAGE.trace?STAGE.trace[Math.min(STAGE.i,STAGE.trace.length-1)]:null;
  if(row0&&((STAGE.mf=(STAGE.mf||0)+1)%6===0||!STAGE.scene)){
    try{_stageUpdateModel(row0);}catch(e){console.warn("stageModel",e);}
  }
  if(STAGE.playing&&STAGE.trace){
    const n=STAGE.trace.length;
    const adv=Math.max(1,Math.round(dt*STAGE.speed/(STAGE.tMax/Math.max(1,n-1))));
    STAGE.i+=adv;
    if(STAGE.i>=n-1){STAGE.i=0;if(!STAGE.loop){STAGE.playing=false;STAGE.i=n-1;}}
  }
  const row=STAGE.trace[Math.min(STAGE.i,STAGE.trace.length-1)];
  try{stageCam(row);drawStage(row);}catch(e){console.warn("stageRender",e);}
  try{drawStageTelemetry(row);}catch(e){console.warn("stageTel",e);}
  const sc=document.getElementById("stScrub");
  if(sc&&STAGE.trace.length>1)sc.value=Math.round(STAGE.i/(STAGE.trace.length-1)*1000);
  requestAnimationFrame(stageTick);
}

function drawStage(row){
  const v=STAGE.v,ctx=v.ctx;if(!row)return;
  const w=v.w,h=v.h;
  ctx.fillStyle="#0E1218";ctx.fillRect(0,0,w,h);
  const P3=p=>{
    const q=[p[0]-v.eye[0],p[1]-v.eye[1],p[2]-v.eye[2]];
    const z=q[0]*v.fw[0]+q[1]*v.fw[1]+q[2]*v.fw[2];
    if(z<2)return null;
    const f=v.dist/z;
    return [w/2+(q[0]*v.rt[0]+q[1]*v.rt[1]+q[2]*v.rt[2])*f*v.s,
            h/2-(q[0]*v.up[0]+q[1]*v.up[1]+q[2]*v.up[2])*f*v.s];
  };
  ctx.strokeStyle="rgba(70,86,110,0.22)";ctx.lineWidth=1;
  for(let g=-140;g<=140;g+=10){
    let a=P3([g,-140,-0.85]),b=P3([g,140,-0.85]);
    if(a&&b){ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();}
    a=P3([-140,g,-0.85]);b=P3([140,g,-0.85]);
    if(a&&b){ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();}
  }
  const tr=STAGE.trace,reqT=STAGE.req.track;
  ctx.strokeStyle="#6C788A";ctx.setLineDash([9,6]);ctx.lineWidth=1.6;
  ctx.beginPath();
  reqT.forEach((p,k)=>{const pt=P3([p.x,p.y,0]);if(!pt)return;if(k===0)ctx.moveTo(pt[0],pt[1]);else ctx.lineTo(pt[0],pt[1]);});
  ctx.stroke();ctx.setLineDash([]);
  for(let k=1;k<=STAGE.i;k++){
    const a=tr[k-1],b=tr[k],g=Math.min(1,Math.abs(b.ay)/19.62);
    const A=P3([a.x,a.y,0]),B=P3([b.x,b.y,0]);
    if(!A||!B)continue;
    ctx.strokeStyle="hsl("+(120-120*g|0)+",76%,55%)";ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(A[0],A[1]);ctx.lineTo(B[0],B[1]);ctx.stroke();
  }
  const psi=row.psi,c=Math.cos(psi),sn=Math.sin(psi);
  const x=row.x,y=row.y;
  const W=p=>[x+p[1]*c+p[0]*sn, y+p[1]*sn-p[0]*c, p[2]];
  const sc=STAGE.scene||buildScenePRO();
  const drawPoly=(pts,cl,w2,d2,f2)=>{ctx.strokeStyle=cl;ctx.lineWidth=w2||1;ctx.setLineDash(d2||[]);
    ctx.beginPath();let first=true;
    pts.forEach(p=>{const q=P3(W(p));if(!q)return;if(first){ctx.moveTo(q[0],q[1]);first=false;}else ctx.lineTo(q[0],q[1]);});
    ctx.setLineDash([]);
    if(!first&&f2){ctx.fillStyle=f2;ctx.fill();}
    ctx.stroke();};
  for(const el of sc){
    if(el.k==="l"){const A=P3(W(el.a)),B=P3(W(el.b));
      if(A&&B){ctx.strokeStyle=el.c;ctx.lineWidth=el.w||1;ctx.setLineDash(el.d||[]);
        ctx.beginPath();ctx.moveTo(A[0],A[1]);ctx.lineTo(B[0],B[1]);ctx.stroke();ctx.setLineDash([]);}}
    else if(el.k==="p"){drawPoly(el.pts,el.c,el.w,el.d,el.f);}
    else if(el.k==="n"){const p=P3(W(el.p));if(p){ctx.fillStyle=el.fix?"#D9534F":"#4697E6";
      ctx.beginPath();ctx.arc(p[0],p[1],el.sx||2.2,0,6.2832);ctx.fill();}}
  }
  ctx.fillStyle="rgba(10,13,18,0.72)";ctx.fillRect(0,0,w,20);
  ctx.fillStyle="#E6E9EF";ctx.font="10px ui-monospace,monospace";
  ctx.fillText("t="+(STAGE.res.t[STAGE.i]||0).toFixed(1)+"s  v="+row.vx.toFixed(1)+"m/s  ay="+(row.ay/9.81).toFixed(2)+"g  yaw="+row.r.toFixed(2)+"rad/s  cam="+STAGE.cam, 10, 13);
}
function drawStageTelemetry(row){
  if(!row)return;
  const set=(id,t)=>{const e=document.getElementById(id);if(e)e.textContent=t;};
  set("telV",row.vx.toFixed(1));set("telAx",(row.ax||0).toFixed(2));
  set("telAy",(row.ay/9.81).toFixed(2)+" g");set("telYaw",row.r.toFixed(3));
  set("telRoll",(row.roll||0).toFixed(2));set("telPitch",(row.pitch||0).toFixed(2));
  set("telDelta",(row.delta*57.2958).toFixed(1));set("telThr",(row.throttle*100).toFixed(0)+"%");
  set("telBrk",(row.brake*100).toFixed(0)+"%");
  set("telSlipMax",Math.max(Math.abs(row.alphaL_FR||0),Math.abs(row.alphaL_FL||0),Math.abs(row.alphaL_RR||0),Math.abs(row.alphaL_RL||0)).toFixed(2));
  set("telDist",((STAGE.res&&STAGE.res.t[STAGE.i])||0).toFixed(1));
  const maxMu=Math.max(row.mu_FR||0,row.mu_FL||0,row.mu_RR||0,row.mu_RL||0);
  set("telMuMax",(maxMu*100).toFixed(0)+"%");
  const fc=["FL","FR","RL","RR"];
  const gr=document.getElementById("fcGrid").querySelectorAll(".fc-c");
  const mu=5250/3500;
  fc.forEach((wk,idx)=>{
    const cv=gr[idx];if(!cv)return;const ctx=cv.getContext("2d");
    const w=cv.width,h=cv.height,cx=w/2,cy=h/2,R=Math.min(w,h)/2-8;
    ctx.clearRect(0,0,w,h);ctx.fillStyle="#0F141B";ctx.fillRect(0,0,w,h);
    ctx.strokeStyle="#323E52";ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(0,cy);ctx.lineTo(w,cy);ctx.moveTo(cx,0);ctx.lineTo(cx,h);ctx.stroke();
    ctx.strokeStyle="#6C788A";ctx.setLineDash([4,3]);
    ctx.beginPath();ctx.arc(cx,cy,R,0,6.2832);ctx.stroke();ctx.setLineDash([]);
    const fxN=row["fx_"+wk]||0,fyN=row["fy_"+wk]||0,fz=row["fz_"+wk]||1;
    const px=cx+(fxN/(fz*mu))*R, py=cy-(fyN/(fz*mu))*R;
    ctx.strokeStyle="#4697E6";ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(px,py);ctx.stroke();
    ctx.fillStyle="#D99A43";ctx.beginPath();ctx.arc(px,py,3.4,0,6.2832);ctx.fill();
    ctx.fillStyle="#9AA4B5";ctx.font="8px monospace";
    ctx.fillText("Fz "+(fz/1000).toFixed(1)+"kN",6,10);
    ctx.fillText("a "+row["alpha_"+wk]+"  aL "+row["alphaL_"+wk],6,h-8);
    ctx.fillText("mu "+(row["mu_"+wk]||0).toFixed(2),w-30,h-8);
  });
}

function buildTrackPanel(host){
  const b = sec(host, "动态驾驶测试 🏎️", "DYNAMIC TESTS", true, "blu");
  
  const d = E("div");
  d.style.display = "flex"; 
  d.style.flexDirection = "column"; 
  d.style.gap = "6px";
  d.style.padding = "6px 8px 8px 8px";
  
  const b1 = E("button"); 
  b1.innerHTML = "🛣️ 直线综合工况试验场 (PROVING GROUND)"; 
  b1.onclick = () => { openSlopeStage(); };
  b1.style.padding = "7px 8px"; b1.style.background = "rgba(46,160,67,0.12)"; b1.style.border = "1px solid rgba(46,160,67,0.35)"; 
  b1.style.color = "#7ee787"; b1.style.borderRadius = "var(--r-sm)"; b1.style.cursor = "pointer"; b1.style.fontWeight = "600"; b1.style.fontSize = "10.5px"; b1.style.letterSpacing = "0.04em";
  b1.style.transition = "background .18s, border-color .18s, transform .1s";
  
  const b2 = E("button"); 
  b2.innerHTML = "⭕ 定圆绕环稳态测试 (SKIDPAD)"; 
  b2.onclick = () => { openSkidpadStage(); };
  b2.style.padding = "7px 8px"; b2.style.background = "rgba(210,153,34,0.12)"; b2.style.border = "1px solid rgba(210,153,34,0.35)"; 
  b2.style.color = "#e3b341"; b2.style.borderRadius = "var(--r-sm)"; b2.style.cursor = "pointer"; b2.style.fontWeight = "600"; b2.style.fontSize = "10.5px"; b2.style.letterSpacing = "0.04em";
  b2.style.transition = "background .18s, border-color .18s, transform .1s";
  
  const b3 = E("button"); 
  b3.innerHTML = "🏁 综合赛道自动驾驶 (CIRCUIT)"; 
  b3.onclick = () => { openCircuitStage(); };
  b3.style.padding = "7px 8px"; b3.style.background = "rgba(88,166,255,0.12)"; b3.style.border = "1px solid rgba(88,166,255,0.35)"; 
  b3.style.color = "#79c0ff"; b3.style.borderRadius = "var(--r-sm)"; b3.style.cursor = "pointer"; b3.style.fontWeight = "600"; b3.style.fontSize = "10.5px"; b3.style.letterSpacing = "0.04em";
  b3.style.transition = "background .18s, border-color .18s, transform .1s";
  
  b1.onmouseover = () => { b1.style.background = "rgba(46,160,67,0.25)"; b1.style.borderColor = "#2ea043"; };
  b1.onmouseout = () => { b1.style.background = "rgba(46,160,67,0.12)"; b1.style.borderColor = "rgba(46,160,67,0.35)"; };
  b2.onmouseover = () => { b2.style.background = "rgba(210,153,34,0.25)"; b2.style.borderColor = "#d29922"; };
  b2.onmouseout = () => { b2.style.background = "rgba(210,153,34,0.12)"; b2.style.borderColor = "rgba(210,153,34,0.35)"; };
  b3.onmouseover = () => { b3.style.background = "rgba(88,166,255,0.25)"; b3.style.borderColor = "#58a6ff"; };
  b3.onmouseout = () => { b3.style.background = "rgba(88,166,255,0.12)"; b3.style.borderColor = "rgba(88,166,255,0.35)"; };
  
  d.appendChild(b1);
  d.appendChild(b2);
  d.appendChild(b3);
  b.appendChild(d);
}
function buildTrackTelemetry(host){
  const b2=sec(host,"赛道动态遥测","TRACK TELEMETRY · HUD",false,"purp");
  const gg=E("canvas","plot");gg.id="trkGG";gg.style.height="200px";gg.style.width="100%";
  b2.appendChild(gg);
  const fz=E("canvas","plot");fz.id="trkFZ";fz.style.height="64px";fz.style.width="100%";
  b2.appendChild(fz);
  [["trkC1",110],["trkC2",96],["trkC3",96]].forEach(q=>{
    const cv=E("canvas","plot");cv.id=q[0];cv.style.height=q[1]+"px";cv.style.width="100%";
    b2.appendChild(cv);});
}
window.addEventListener("keydown",e=>{
  if(e.code!=="Space")return;
  const t=e.target;
  if(t&&(t.tagName==="INPUT"||t.tagName==="SELECT"||t.tagName==="TEXTAREA"||t.isContentEditable))return;
  /* F-55（2026-08-30）：空格只在回放激活态生效——旧实现判断 TRK.res，
     TRK.res 退出回放后永不清空，slope/skidpad 舞台的 Space 手刹被永久吃掉。 */
  if(TRK.active&&TRK.res){e.preventDefault();TRK.playing=!TRK.playing;syncTrackUI();}
});

/* ================================ 15. 初始化与启动 ================================ */
