import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";

// Polyfill for window.storage if it does not exist (e.g. running in standard browser/Vite dev server)
if (typeof window !== "undefined" && !window.storage) {
  window.storage = {
    get: async (key, isJson) => {
      try {
        const value = localStorage.getItem(key);
        return value !== null ? { value } : null;
      } catch (e) {
        console.error("Error reading from localStorage:", e);
        return null;
      }
    },
    set: async (key, value, isJson) => {
      try {
        localStorage.setItem(key, value);
      } catch (e) {
        console.error("Error writing to localStorage:", e);
      }
    }
  };
}

// ═══════════════════════════════════════════════════════════════
// DATOS REALES – MUNDIAL 2026
// ═══════════════════════════════════════════════════════════════

const GRUPOS = {
  A: ["México",        "Sudáfrica",      "Corea del Sur",  "Rep. Checa"],
  B: ["Canadá",        "Bosnia-Herz.",   "Qatar",          "Suiza"],
  C: ["Brasil",        "Marruecos",      "Haití",          "Escocia"],
  D: ["Estados Unidos","Paraguay",       "Australia",      "Turquía"],
  E: ["Alemania",      "Curazao",        "C. de Marfil",   "Ecuador"],
  F: ["Países Bajos",  "Japón",          "Suecia",         "Túnez"],
  G: ["Bélgica",       "Egipto",         "Irán",           "Nueva Zelanda"],
  H: ["España",        "Cabo Verde",     "Arabia Saudita", "Uruguay"],
  I: ["Francia",       "Senegal",        "Irak",           "Noruega"],
  J: ["Argentina",     "Argelia",        "Austria",        "Jordania"],
  K: ["Portugal",      "Uzbekistán",     "Colombia",       "R.D. Congo"],
  L: ["Inglaterra",    "Croacia",        "Ghana",          "Panamá"],
};

const BANDERAS = {
  "México":"🇲🇽","Sudáfrica":"🇿🇦","Corea del Sur":"🇰🇷","Rep. Checa":"🇨🇿",
  "Canadá":"🇨🇦","Bosnia-Herz.":"🇧🇦","Qatar":"🇶🇦","Suiza":"🇨🇭",
  "Brasil":"🇧🇷","Marruecos":"🇲🇦","Haití":"🇭🇹","Escocia":"🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  "Estados Unidos":"🇺🇸","Paraguay":"🇵🇾","Australia":"🇦🇺","Turquía":"🇹🇷",
  "Alemania":"🇩🇪","Curazao":"🇨🇼","C. de Marfil":"🇨🇮","Ecuador":"🇪🇨",
  "Países Bajos":"🇳🇱","Japón":"🇯🇵","Suecia":"🇸🇪","Túnez":"🇹🇳",
  "Bélgica":"🇧🇪","Egipto":"🇪🇬","Irán":"🇮🇷","Nueva Zelanda":"🇳🇿",
  "España":"🇪🇸","Cabo Verde":"🇨🇻","Arabia Saudita":"🇸🇦","Uruguay":"🇺🇾",
  "Francia":"🇫🇷","Senegal":"🇸🇳","Irak":"🇮🇶","Noruega":"🇳🇴",
  "Argentina":"🇦🇷","Argelia":"🇩🇿","Austria":"🇦🇹","Jordania":"🇯🇴",
  "Portugal":"🇵🇹","Uzbekistán":"🇺🇿","Colombia":"🇨🇴","R.D. Congo":"🇨🇩",
  "Inglaterra":"🏴󠁧󠁢󠁥󠁮󠁧󠁿","Croacia":"🇭🇷","Ghana":"🇬🇭","Panamá":"🇵🇦",
};

const fl = (p) => p ? `${BANDERAS[p]||"🏳️"} ${p}` : "— TBD —";

function genPartidosGrupo(grupo, equipos) {
  const out = []; let n = 1;
  for (let i = 0; i < equipos.length; i++)
    for (let j = i+1; j < equipos.length; j++)
      out.push({ id:`G${grupo}_${n++}`, fase:"grupos", grupo, local:equipos[i], visitante:equipos[j] });
  return out;
}

const PARTIDOS_GRUPOS = Object.entries(GRUPOS).flatMap(([g,eq]) => genPartidosGrupo(g,eq));

const FASES_ELIM = [
  { key:"r32",   label:"16avos de final", n:16 },
  { key:"r16",   label:"Octavos de final", n:8  },
  { key:"qf",    label:"Cuartos de final", n:4  },
  { key:"sf",    label:"Semifinales",      n:2  },
  { key:"tp",    label:"3er Puesto",       n:1  },
  { key:"final", label:"Final",            n:1  },
];

function crearSlots(fase, n) {
  return Array.from({length:n},(_,i) => ({id:`${fase}_${i+1}`,fase,local:null,visitante:null}));
}
function initSlots() {
  const s = {};
  FASES_ELIM.forEach(({key,n}) => { s[key] = crearSlots(key,n); });
  return s;
}

const PTS_RES = 2, PTS_EXACTO = 3;

function getRes(gl,gv) {
  if (gl==null||gl===""||gv==null||gv==="") return null;
  const l=parseInt(gl), v=parseInt(gv);
  return l>v?"L":v>l?"V":"E";
}

function calcPuntos(prons, resultados) {
  let pts=0;
  for (const id in prons) {
    const p=prons[id], r=resultados[id];
    if (!r||r.gl==null||r.gl==="") continue;
    const rr=getRes(r.gl,r.gv), rp=getRes(p.gl,p.gv);
    if (rr&&rp===rr) {
      pts+=PTS_RES;
      if (String(p.gl)===String(r.gl)&&String(p.gv)===String(r.gv)) pts+=PTS_EXACTO;
    }
  }
  return pts;
}

function calcTabla(grupo, resultados) {
  const tab = Object.fromEntries(GRUPOS[grupo].map(e=>[e,{pts:0,gf:0,gc:0,j:0}]));
  PARTIDOS_GRUPOS.filter(p=>p.grupo===grupo).forEach(p=>{
    const r=resultados[p.id];
    if (!r||r.gl==null||r.gl==="") return;
    const gl=parseInt(r.gl), gv=parseInt(r.gv);
    tab[p.local].gf+=gl; tab[p.local].gc+=gv; tab[p.local].j++;
    tab[p.visitante].gf+=gv; tab[p.visitante].gc+=gl; tab[p.visitante].j++;
    if(gl>gv) tab[p.local].pts+=3;
    else if(gv>gl) tab[p.visitante].pts+=3;
    else { tab[p.local].pts+=1; tab[p.visitante].pts+=1; }
  });
  return Object.entries(tab)
    .sort((a,b)=>b[1].pts-a[1].pts||(b[1].gf-b[1].gc)-(a[1].gf-a[1].gc)||b[1].gf-a[1].gf)
    .map(([equipo,s])=>({equipo,...s}));
}

const STORAGE_KEY = "prode_mundial_2026_v3";
function initData() { return {pronosticos:{},resultados:{},slots:initSlots(),campeones:{}}; }

// ═══════════════════════════════════════════════════════════════════
// COLORES
const G="#e8b923", GD="#c49a10", BG="#060a0f", BG2="#0d1118", BG3="#141c26";
const BOR="#1c2530", TXT="#b8cbb8", TXT2="#4a6a4a";

// ═══════════════════════════════════════════════════════════════════
// COMPONENTES
// ═══════════════════════════════════════════════════════════════════

function Ingreso({onEnter}) {
  const [nombre,setNombre]=useState("");
  const [pin,setPin]=useState("");
  const [modo,setModo]=useState("jugador");
  const [err,setErr]=useState(false);

  function entrar() {
    if (!nombre.trim()) return;
    if (modo==="admin"&&pin!=="1234") { setErr(true); setTimeout(()=>setErr(false),600); return; }
    onEnter(nombre.trim(), modo==="admin");
  }

  return (
    <div style={{minHeight:"100vh",background:BG,display:"flex",alignItems:"center",justifyContent:"center",padding:16,position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse 70% 50% at 50% -10%, rgba(30,70,30,.3) 0%, transparent 70%)",pointerEvents:"none"}}/>
      <div style={{position:"relative",width:"100%",maxWidth:400}}>
        {/* Logo */}
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{fontSize:60,lineHeight:1}}>⚽</div>
          <div style={{fontSize:54,fontFamily:"Georgia,serif",fontWeight:900,letterSpacing:8,color:G,textShadow:`0 0 50px ${G}44`,marginTop:6}}>PRODE</div>
          <div style={{fontSize:20,fontFamily:"Georgia,serif",letterSpacing:6,color:"#2a5a2a",marginTop:2}}>MUNDIAL 2026</div>
          <div style={{fontSize:11,fontFamily:"monospace",letterSpacing:3,color:"#1e3a1e",marginTop:6}}>Canadá · México · Estados Unidos</div>
        </div>
        {/* Card */}
        <div style={{background:BG2,border:`1px solid ${BOR}`,borderRadius:12,padding:"22px 20px",
          outline: err?"1px solid #ef4444":"1px solid transparent",transition:"outline .2s"}}>
          {/* Tabs modo */}
          <div style={{display:"flex",borderRadius:8,overflow:"hidden",border:`1px solid ${BOR}`,marginBottom:16}}>
            {["jugador","admin"].map(m=>(
              <button key={m} onClick={()=>setModo(m)}
                style={{flex:1,padding:"10px 0",background:modo===m?G:"transparent",border:"none",
                  color:modo===m?"#000":TXT2,fontFamily:"monospace",fontSize:13,letterSpacing:2,cursor:"pointer"}}>
                {m==="jugador"?"⚽ Jugador":"🔑 Admin"}
              </button>
            ))}
          </div>
          <input style={{width:"100%",background:BG,border:`1px solid ${BOR}`,borderRadius:8,color:TXT,
            padding:"11px 14px",fontSize:15,fontFamily:"Georgia,serif",marginBottom:12,boxSizing:"border-box",outline:"none"}}
            placeholder="Ingresá tu nombre" value={nombre}
            onChange={e=>setNombre(e.target.value)} onKeyDown={e=>e.key==="Enter"&&entrar()} />
          {modo==="admin"&&(
            <input style={{width:"100%",background:BG,border:`1px solid ${BOR}`,borderRadius:8,color:TXT,
              padding:"11px 14px",fontSize:15,fontFamily:"Georgia,serif",marginBottom:12,boxSizing:"border-box",outline:"none"}}
              type="password" placeholder="PIN de administrador"
              value={pin} onChange={e=>setPin(e.target.value)} onKeyDown={e=>e.key==="Enter"&&entrar()} />
          )}
          <button onClick={entrar} style={{width:"100%",background:`linear-gradient(135deg,${G},${GD})`,color:"#000",
            border:"none",borderRadius:8,padding:"13px 0",fontSize:16,fontFamily:"Georgia,serif",fontWeight:"bold",
            cursor:"pointer",letterSpacing:1}}>
            {modo==="jugador"?"Ingresar al Prode →":"Entrar como Admin →"}
          </button>
          {modo==="admin"&&<p style={{color:TXT2,fontSize:12,textAlign:"center",fontFamily:"monospace",margin:"10px 0 0",letterSpacing:1}}>PIN predeterminado: <b>1234</b></p>}
        </div>
      </div>
    </div>
  );
}

function TopBar({nombre,pts,isAdmin,onLogout}) {
  return (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
      padding:"10px 16px",background:BG2,borderBottom:`1px solid ${BOR}`,position:"sticky",top:0,zIndex:20}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        {isAdmin
          ? <span style={{fontSize:14,color:G,fontFamily:"monospace",letterSpacing:3}}>🔑 ADMIN</span>
          : <><span style={{fontSize:17,color:G,letterSpacing:2,fontFamily:"Georgia,serif",fontWeight:"bold"}}>{nombre}</span>
             {pts>0&&<span style={{background:G,color:"#000",borderRadius:20,padding:"2px 10px",fontSize:12,fontFamily:"monospace",fontWeight:"bold"}}>{pts} pts</span>}</>}
      </div>
      <button onClick={onLogout} style={{background:"transparent",border:`1px solid ${BOR}`,color:TXT2,
        borderRadius:6,padding:"5px 12px",fontSize:12,fontFamily:"monospace",cursor:"pointer"}}>Salir</button>
    </div>
  );
}

function TabBar({tabs,active,onChange}) {
  return (
    <div style={{display:"flex",overflowX:"auto",background:BG2,borderBottom:`1px solid ${BOR}`,scrollbarWidth:"none"}}>
      {tabs.map(t=>(
        <button key={t.key} onClick={()=>onChange(t.key)}
          style={{flex:"0 0 auto",padding:"10px 14px",background:"transparent",border:"none",
            borderBottom:active===t.key?`2px solid ${G}`:"2px solid transparent",
            color:active===t.key?G:TXT2,fontFamily:"monospace",fontSize:12,letterSpacing:1,
            cursor:"pointer",whiteSpace:"nowrap",transition:"all .2s"}}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

function FilaPartido({local,visitante,gl,gv,rgl,rgv,onChange,disabled}) {
  const tieneRes=rgl!=null&&rgl!=="";
  const rr=getRes(rgl,rgv), rp=getRes(gl,gv);
  const exacto=tieneRes&&rp&&String(gl)===String(rgl)&&String(gv)===String(rgv);
  const acerto=tieneRes&&rp&&rp===rr;
  const bg=!tieneRes||rp===null?"transparent":exacto?"rgba(34,197,94,.09)":acerto?"rgba(59,130,246,.09)":"rgba(239,68,68,.07)";
  const mark=exacto?"🎯":acerto?"✅":tieneRes&&rp!==null?"❌":"";
  function inp(side,e) {
    const v=e.target.value;
    if (v===""||(/^\d+$/.test(v)&&+v<=20)) onChange(side,v);
  }
  return (
    <div style={{display:"flex",alignItems:"center",padding:"7px 12px",borderBottom:`1px solid ${BOR}`,gap:5,background:bg,transition:"background .3s",minHeight:46}}>
      <span style={{flex:1,fontSize:11,color:TXT,textAlign:"right",lineHeight:1.35,wordBreak:"break-word"}}>{fl(local)}</span>
      <div style={{display:"flex",alignItems:"center",gap:3,flexShrink:0}}>
        <input value={gl??""} inputMode="numeric" maxLength={2} disabled={disabled}
          onChange={e=>inp("gl",e)}
          style={{width:34,height:34,textAlign:"center",background:BG3,border:`1px solid ${BOR}`,borderRadius:6,
            color:G,fontSize:17,fontFamily:"monospace",fontWeight:"bold",outline:"none",opacity:disabled?.45:1}} />
        <span style={{color:BOR,fontSize:14,userSelect:"none"}}>–</span>
        <input value={gv??""} inputMode="numeric" maxLength={2} disabled={disabled}
          onChange={e=>inp("gv",e)}
          style={{width:34,height:34,textAlign:"center",background:BG3,border:`1px solid ${BOR}`,borderRadius:6,
            color:G,fontSize:17,fontFamily:"monospace",fontWeight:"bold",outline:"none",opacity:disabled?.45:1}} />
        {tieneRes&&<span style={{fontSize:10,color:TXT2,fontFamily:"monospace",marginLeft:3}}>({rgl}-{rgv})</span>}
        {mark&&<span style={{fontSize:14,marginLeft:3}}>{mark}</span>}
      </div>
      <span style={{flex:1,fontSize:11,color:TXT,textAlign:"left",lineHeight:1.35,wordBreak:"break-word"}}>{fl(visitante)}</span>
    </div>
  );
}

function GrupoSection({grupo,form,resultados,onChange,isAdmin,onAdminChange}) {
  const tabla=calcTabla(grupo,resultados);
  return (
    <div style={{marginBottom:2}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
        padding:"7px 14px 5px",background:BG2,borderBottom:`1px solid ${BOR}`,flexWrap:"wrap",gap:4}}>
        <span style={{fontSize:12,fontFamily:"monospace",letterSpacing:4,color:G}}>GRUPO {grupo}</span>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {tabla.map((row,i)=>(
            <span key={row.equipo} style={{fontSize:10,fontFamily:"monospace",color:i<2?G:TXT2,letterSpacing:.5}}>
              {i+1}. {BANDERAS[row.equipo]||"🏳️"} {row.pts}p
            </span>
          ))}
        </div>
      </div>
      {PARTIDOS_GRUPOS.filter(p=>p.grupo===grupo).map(partido=>{
        const r=resultados[partido.id]||{};
        const pron=form[partido.id]||{gl:"",gv:""};
        const bloq=!isAdmin&&r.gl!=null&&r.gl!=="";
        return (
          <FilaPartido key={partido.id}
            local={partido.local} visitante={partido.visitante}
            gl={isAdmin?(r.gl??""):(pron.gl??"")}
            gv={isAdmin?(r.gv??""):(pron.gv??"")}
            rgl={isAdmin?null:r.gl} rgv={isAdmin?null:r.gv}
            disabled={bloq}
            onChange={isAdmin
              ? (side,val)=>onAdminChange(partido.id,side,val)
              : (side,val)=>onChange(partido.id,side,val)} />
        );
      })}
    </div>
  );
}

function AdminSlot({slot,idx,fase,resultado,onResult,onAvanzar,onCampeon,campeonActual,onAvanzarTP}) {
  const {local,visitante}=slot;
  const disponible=local&&visitante;
  const {gl,gv}=resultado;
  const tieneRes=gl!=null&&gl!==""&&gv!=null&&gv!=="";
  const ganadorAuto=tieneRes?(parseInt(gl)>parseInt(gv)?local:parseInt(gv)>parseInt(gl)?visitante:null):null;
  const perdedorAuto=tieneRes&&ganadorAuto?(ganadorAuto===local?visitante:local):null;
  const esFinal=fase==="final", esTP=fase==="tp";

  return (
    <div style={{borderBottom:`1px solid ${BOR}`,paddingBottom:8}}>
      <div style={{display:"flex",alignItems:"center",gap:8,padding:"7px 14px 2px"}}>
        <span style={{fontSize:10,fontFamily:"monospace",color:TXT2,letterSpacing:2}}>Partido {idx+1}</span>
        {!disponible&&<span style={{fontSize:10,fontFamily:"monospace",color:"#1e3a1e",letterSpacing:1}}>Esperando clasificados…</span>}
      </div>
      <FilaPartido local={local} visitante={visitante}
        gl={gl} gv={gv} rgl={null} rgv={null}
        disabled={!disponible}
        onChange={(side,val)=>onResult(side,val)} />
      {disponible&&tieneRes&&(
        <div style={{padding:"5px 14px 2px"}}>
          {!esFinal&&!esTP&&(
            <>
              <div style={{fontSize:11,fontFamily:"monospace",color:TXT2,letterSpacing:1,marginBottom:5}}>
                {ganadorAuto?"Avanzar ganador:":"Empate — elegir quién avanza:"}
              </div>
              <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
                {ganadorAuto
                  ? <button onClick={()=>onAvanzar(ganadorAuto)} style={btnAvz}>{fl(ganadorAuto)} →</button>
                  : [local,visitante].map(eq=><button key={eq} onClick={()=>onAvanzar(eq)} style={btnAvz}>{fl(eq)} →</button>)}
              </div>
              {fase==="sf"&&perdedorAuto&&(
                <div style={{marginTop:6}}>
                  <div style={{fontSize:11,fontFamily:"monospace",color:"#4a4a4a",marginBottom:4}}>3er puesto (perdedor):</div>
                  <button onClick={()=>onAvanzarTP(perdedorAuto)} style={{...btnAvz,opacity:.6}}>{fl(perdedorAuto)} → 3er puesto</button>
                </div>
              )}
            </>
          )}
          {(esFinal||esTP)&&(
            <div>
              <div style={{fontSize:11,fontFamily:"monospace",color:esFinal?G:TXT2,letterSpacing:1,marginBottom:5}}>
                {esFinal?"🏆 Coronar campeón:":"🥉 Definir tercer puesto:"}
              </div>
              <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
                {[local,visitante].map(eq=>(
                  <button key={eq} onClick={()=>onCampeon(eq)}
                    style={{...btnAvz,border:campeonActual===eq?`1px solid ${G}`:`1px solid ${BOR}`,
                      color:campeonActual===eq?G:TXT}}>
                    {fl(eq)} {campeonActual===eq?"✓":""}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const btnAvz={background:BG3,border:`1px solid ${BOR}`,color:TXT,borderRadius:6,padding:"5px 12px",
  fontSize:12,fontFamily:"monospace",cursor:"pointer"};

function RankingView({ranking,campeon}) {
  return (
    <div style={{padding:"14px 16px 48px"}}>
      {campeon&&(
        <div style={{textAlign:"center",padding:"22px 16px",marginBottom:20,
          background:"linear-gradient(135deg,#140e00,#0a0a00)",border:`1px solid ${G}55`,borderRadius:12}}>
          <div style={{fontSize:40}}>🏆</div>
          <div style={{fontSize:22,color:G,fontWeight:"bold",letterSpacing:2,marginTop:8}}>{fl(campeon)}</div>
          <div style={{fontSize:11,color:GD,fontFamily:"monospace",letterSpacing:4,marginTop:4}}>CAMPEÓN MUNDIAL 2026</div>
        </div>
      )}
      <p style={{fontSize:11,color:TXT2,fontFamily:"monospace",textAlign:"center",letterSpacing:1,marginBottom:14}}>
        +{PTS_RES} resultado correcto · +{PTS_EXACTO} marcador exacto
      </p>
      {ranking.length===0&&<p style={{color:TXT2,fontFamily:"monospace",fontSize:12,textAlign:"center",padding:"32px 0"}}>Sin pronósticos aún.</p>}
      {ranking.map((j,i)=>(
        <div key={j.nombre} style={{display:"flex",alignItems:"center",
          background:i===0?"#100e00":BG2,borderRadius:10,padding:"11px 14px",marginBottom:7,
          border:i===0?`1px solid ${G}77`:`1px solid ${BOR}`,gap:12}}>
          <span style={{fontSize:22,width:30,textAlign:"center",flexShrink:0}}>
            {i===0?"🥇":i===1?"🥈":i===2?"🥉":`${i+1}`}
          </span>
          <span style={{flex:1,fontSize:17,color:TXT,letterSpacing:1,fontFamily:"Georgia,serif",fontWeight:"bold"}}>{j.nombre}</span>
          <div style={{display:"flex",alignItems:"baseline",gap:4}}>
            <span style={{fontSize:26,color:G,fontFamily:"monospace",fontWeight:"bold"}}>{j.pts}</span>
            <span style={{fontSize:11,color:TXT2,fontFamily:"monospace"}}>pts</span>
            <span style={{fontSize:12,color:TXT2,fontFamily:"monospace",marginLeft:8}}>🎯{j.exactos}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Vista Jugador ─────────────────────────────────────────────
function VistaJugador({jugador,data,onSave,onLogout}) {
  const {pronosticos,resultados,slots}=data;
  const misPron=pronosticos[jugador]||{};
  const [form,setForm]=useState(()=>{
    const f={};
    PARTIDOS_GRUPOS.forEach(p=>{ f[p.id]={...(misPron[p.id]||{gl:"",gv:""})}; });
    FASES_ELIM.forEach(({key})=>{
      (slots[key]||[]).forEach(s=>{ f[s.id]={...(misPron[s.id]||{gl:"",gv:""})}; });
    });
    return f;
  });
  const [tab,setTab]=useState("grupos");
  const [saved,setSaved]=useState(false);
  const pts=calcPuntos(form,resultados);

  const TABS=[{key:"grupos",label:"Grupos"},...FASES_ELIM.map(f=>({key:f.key,label:f.label})),{key:"ranking",label:"📊 Ranking"}];

  function cambiar(id,side,val) { setForm(prev=>({...prev,[id]:{...prev[id],[side]:val}})); setSaved(false); }
  function guardar() { onSave(jugador,form); setSaved(true); setTimeout(()=>setSaved(false),2500); }

  const ranking=Object.entries(pronosticos).map(([n,p])=>({
    nombre:n, pts:calcPuntos(p,resultados),
    exactos:Object.keys(p).filter(id=>{
      const r=resultados[id];
      return r&&r.gl!=null&&r.gl!==""&&String(p[id]?.gl)===String(r.gl)&&String(p[id]?.gv)===String(r.gv);
    }).length
  })).sort((a,b)=>b.pts-a.pts||b.exactos-a.exactos);

  return (
    <div style={{minHeight:"100vh",background:BG,display:"flex",flexDirection:"column",fontFamily:"Georgia,serif"}}>
      <TopBar nombre={jugador} pts={pts} onLogout={onLogout}/>
      <TabBar tabs={TABS} active={tab} onChange={setTab}/>
      <div style={{flex:1,overflowY:"auto",paddingBottom:80}}>
        {tab==="grupos"&&Object.keys(GRUPOS).map(g=>(
          <GrupoSection key={g} grupo={g} form={form} resultados={resultados} onChange={cambiar}/>
        ))}
        {FASES_ELIM.map(({key,label})=>tab===key&&(
          <div key={key} style={{paddingBottom:16}}>
            <div style={{padding:"8px 14px 5px",fontSize:12,fontFamily:"monospace",letterSpacing:4,color:G,
              background:BG2,borderBottom:`1px solid ${BOR}`}}>{label}</div>
            {(slots[key]||[]).map(slot=>{
              const r=resultados[slot.id]||{};
              const disp=slot.local&&slot.visitante;
              return (
                <FilaPartido key={slot.id}
                  local={slot.local} visitante={slot.visitante}
                  gl={form[slot.id]?.gl} gv={form[slot.id]?.gv}
                  rgl={r.gl} rgv={r.gv}
                  disabled={!disp||(r.gl!=null&&r.gl!=="")}
                  onChange={(side,val)=>cambiar(slot.id,side,val)}/>
              );
            })}
            {!(slots[key]||[]).some(s=>s.local)&&(
              <p style={{color:TXT2,fontFamily:"monospace",fontSize:12,padding:"28px 16px",textAlign:"center",letterSpacing:1}}>
                Los cruces se publican cuando el admin avanza los clasificados.
              </p>
            )}
          </div>
        ))}
        {tab==="ranking"&&<RankingView ranking={ranking} campeon={data.campeones?.final}/>}
      </div>
      {tab!=="ranking"&&(
        <div style={{position:"fixed",bottom:0,left:0,right:0,padding:"10px 16px 18px",
          background:`linear-gradient(0deg,${BG} 55%,transparent)`}}>
          <button onClick={guardar} style={{width:"100%",
            background:saved?"linear-gradient(135deg,#22c55e,#16a34a)":`linear-gradient(135deg,${G},${GD})`,
            color:"#000",border:"none",borderRadius:8,padding:"13px 0",fontSize:16,
            fontFamily:"Georgia,serif",fontWeight:"bold",cursor:"pointer",letterSpacing:1,transition:"background .4s"}}>
            {saved?"✓ Pronósticos guardados":"Guardar pronósticos"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Vista Admin ────────────────────────────────────────────────
function VistaAdmin({data,onSave,onLogout}) {
  const [res,setRes]=useState({...data.resultados});
  const [slots,setSlots]=useState(()=>JSON.parse(JSON.stringify(data.slots||initSlots())));
  const [campeones,setCampeones]=useState({...data.campeones});
  const [tab,setTab]=useState("grupos");
  const [saved,setSaved]=useState(false);

  const TABS=[{key:"grupos",label:"Grupos"},...FASES_ELIM.map(f=>({key:f.key,label:f.label})),{key:"ranking",label:"📊 Ranking"}];

  function setResultado(id,side,val) {
    if (val!==""&&(isNaN(val)||+val<0||+val>20)) return;
    setRes(prev=>({...prev,[id]:{...prev[id],[side]:val}}));
    setSaved(false);
  }

  function generarBracket() {
    const tablas={};
    Object.keys(GRUPOS).forEach(g=>{tablas[g]=calcTabla(g,res);});
    const pos={};
    Object.keys(GRUPOS).forEach(g=>{
      pos[`1${g}`]=tablas[g][0]?.equipo||null;
      pos[`2${g}`]=tablas[g][1]?.equipo||null;
    });
    const terceros=Object.keys(GRUPOS)
      .map(g=>({equipo:tablas[g][2]?.equipo,pts:tablas[g][2]?.pts||0,dif:(tablas[g][2]?.gf||0)-(tablas[g][2]?.gc||0)}))
      .filter(t=>t.equipo&&t.pts>0)
      .sort((a,b)=>b.pts-a.pts||b.dif-a.dif)
      .slice(0,8).map(t=>t.equipo);

    const cruces=[
      [pos["1A"],pos["2C"]],[pos["1B"],pos["2D"]],
      [pos["1C"],pos["2A"]],[pos["1D"],pos["2B"]],
      [pos["1E"],pos["2G"]],[pos["1F"],pos["2H"]],
      [pos["1G"],pos["2E"]],[pos["1H"],pos["2F"]],
      [pos["1I"],pos["2K"]],[pos["1J"],pos["2L"]],
      [pos["1K"],pos["2I"]],[pos["1L"],pos["2J"]],
      [terceros[0]||null,terceros[1]||null],
      [terceros[2]||null,terceros[3]||null],
      [terceros[4]||null,terceros[5]||null],
      [terceros[6]||null,terceros[7]||null],
    ];
    setSlots(prev=>{
      const next=JSON.parse(JSON.stringify(prev));
      next.r32=crearSlots("r32",16);
      cruces.forEach(([l,v],i)=>{next.r32[i].local=l;next.r32[i].visitante=v;});
      return next;
    });
    setSaved(false);
  }

  function avanzar(fase,slotIdx,equipo) {
    const sig={r32:"r16",r16:"qf",qf:"sf",sf:"final"}[fase];
    setSlots(prev=>{
      const next=JSON.parse(JSON.stringify(prev));
      if (sig) {
        const destIdx=Math.floor(slotIdx/2);
        const esLocal=slotIdx%2===0;
        if (!next[sig]||!next[sig][destIdx]) return next;
        if(esLocal) next[sig][destIdx].local=equipo;
        else        next[sig][destIdx].visitante=equipo;
      }
      return next;
    });
    setSaved(false);
  }

  function avanzarTP(slotIdx,equipo) {
    setSlots(prev=>{
      const next=JSON.parse(JSON.stringify(prev));
      if (!next.tp||!next.tp[0]) return next;
      if(slotIdx===0) next.tp[0].local=equipo;
      else            next.tp[0].visitante=equipo;
      return next;
    });
    setSaved(false);
  }

  function setCampeon(fase,equipo) {
    setCampeones(prev=>({...prev,[fase]:equipo}));
    setSaved(false);
  }

  function guardar() {
    onSave({resultados:res,slots,campeones});
    setSaved(true); setTimeout(()=>setSaved(false),2500);
  }

  const ranking=Object.entries(data.pronosticos||{}).map(([n,p])=>({
    nombre:n, pts:calcPuntos(p,res),
    exactos:Object.keys(p).filter(id=>{
      const r=res[id];
      return r&&r.gl!=null&&r.gl!==""&&String(p[id]?.gl)===String(r.gl)&&String(p[id]?.gv)===String(r.gv);
    }).length
  })).sort((a,b)=>b.pts-a.pts||b.exactos-a.exactos);

  return (
    <div style={{minHeight:"100vh",background:BG,display:"flex",flexDirection:"column",fontFamily:"Georgia,serif"}}>
      <TopBar isAdmin onLogout={onLogout}/>
      <TabBar tabs={TABS} active={tab} onChange={setTab}/>
      <div style={{flex:1,overflowY:"auto",paddingBottom:80}}>
        {tab==="grupos"&&(
          <div>
            <div style={{padding:"12px 16px",background:BG2,borderBottom:`1px solid ${BOR}`}}>
              <p style={{margin:"0 0 8px",fontSize:12,color:TXT2,fontFamily:"monospace",letterSpacing:.5,lineHeight:1.5}}>
                Cargá los resultados de la fase de grupos. Cuando estén completos, generá el bracket de 16avos automáticamente.
              </p>
              <button onClick={generarBracket} style={{background:BG3,border:`1px solid ${G}55`,color:G,
                borderRadius:8,padding:"9px 14px",fontSize:12,fontFamily:"monospace",letterSpacing:1,cursor:"pointer"}}>
                ⚡ Generar bracket de 16avos desde posiciones
              </button>
            </div>
            {Object.keys(GRUPOS).map(g=>(
              <GrupoSection key={g} grupo={g} form={{}} resultados={res} isAdmin
                onAdminChange={(id,side,val)=>setResultado(id,side,val)}/>
            ))}
          </div>
        )}
        {FASES_ELIM.map(({key,label})=>tab===key&&(
          <div key={key} style={{paddingBottom:16}}>
            <div style={{padding:"8px 14px 5px",fontSize:12,fontFamily:"monospace",letterSpacing:4,color:G,
              background:BG2,borderBottom:`1px solid ${BOR}`}}>{label}</div>
            {(slots[key]||[]).map((slot,idx)=>(
              <AdminSlot key={slot.id} slot={slot} idx={idx} fase={key}
                resultado={res[slot.id]||{}}
                onResult={(side,val)=>setResultado(slot.id,side,val)}
                onAvanzar={(eq)=>{ avanzar(key,idx,eq); }}
                onCampeon={(eq)=>setCampeon(key,eq)}
                campeonActual={campeones[key]}
                onAvanzarTP={(eq)=>avanzarTP(idx,eq)}/>
            ))}
            {!(slots[key]||[]).some(s=>s.local)&&(
              <p style={{color:TXT2,fontFamily:"monospace",fontSize:12,padding:"28px 16px",textAlign:"center",letterSpacing:1}}>
                Los cruces se completan avanzando ganadores de la fase anterior.
              </p>
            )}
          </div>
        ))}
        {tab==="ranking"&&<RankingView ranking={ranking} campeon={campeones?.final}/>}
      </div>
      <div style={{position:"fixed",bottom:0,left:0,right:0,padding:"10px 16px 18px",
        background:`linear-gradient(0deg,${BG} 55%,transparent)`}}>
        <button onClick={guardar} style={{width:"100%",
          background:saved?"linear-gradient(135deg,#22c55e,#16a34a)":`linear-gradient(135deg,${G},${GD})`,
          color:"#000",border:"none",borderRadius:8,padding:"13px 0",fontSize:16,
          fontFamily:"Georgia,serif",fontWeight:"bold",cursor:"pointer",letterSpacing:1,transition:"background .4s"}}>
          {saved?"✓ Cambios guardados":"Guardar todos los cambios"}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ROOT
// ═══════════════════════════════════════════════════════════════
export default function App() {
  const [sesion,setSesion]=useState(null);
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);

  useEffect(() => {
    (async () => {
      try {
        // 1. Cargar estado global (resultados, slots, campeones)
        let globalResultados = {};
        let globalSlots = initSlots();
        let globalCampeones = {};

        const { data: globalData, error: globalError } = await supabase
          .from("global_state")
          .select("resultados, slots, campeones")
          .eq("id", 1)
          .maybeSingle();

        if (!globalError && globalData) {
          globalResultados = globalData.resultados || {};
          globalSlots = globalData.slots || initSlots();
          globalCampeones = globalData.campeones || {};
        } else if (globalError) {
          console.error("Error cargando el estado global de Supabase:", globalError);
        }

        // 2. Cargar todos los pronósticos de los jugadores
        const { data: predData, error: predError } = await supabase
          .from("predictions")
          .select("player_name, predictions_data");

        const allPronosticos = {};
        if (!predError && predData) {
          predData.forEach((row) => {
            allPronosticos[row.player_name] = row.predictions_data || {};
          });
        } else if (predError) {
          console.error("Error cargando los pronósticos de Supabase:", predError);
        }

        const base = initData();
        const finalSlots = globalSlots || base.slots;
        Object.keys(base.slots).forEach((k) => {
          if (!finalSlots[k]) finalSlots[k] = base.slots[k];
        });

        setData({
          pronosticos: allPronosticos,
          resultados: globalResultados,
          slots: finalSlots,
          campeones: globalCampeones,
        });
      } catch (err) {
        console.error("Error en inicialización de datos:", err);
        setData(initData());
      }
      setLoading(false);
    })();
  }, []);

  async function handleSaveAdmin(newData) {
    setData((prev) => ({
      ...prev,
      resultados: newData.resultados,
      slots: newData.slots,
      campeones: newData.campeones,
    }));

    try {
      const { error } = await supabase
        .from("global_state")
        .upsert({
          id: 1,
          resultados: newData.resultados,
          slots: newData.slots,
          campeones: newData.campeones,
          updated_at: new Date().toISOString(),
        });
      if (error) throw error;
    } catch (err) {
      console.error("Error al guardar estado de administrador:", err);
      alert("Error al guardar los cambios en la base de datos.");
    }
  }

  async function handleSavePlayer(jugador, prons) {
    setData((prev) => ({
      ...prev,
      pronosticos: {
        ...prev.pronosticos,
        [jugador]: prons,
      },
    }));

    try {
      const { error } = await supabase
        .from("predictions")
        .upsert({
          player_name: jugador,
          predictions_data: prons,
          updated_at: new Date().toISOString(),
        });
      if (error) throw error;
    } catch (err) {
      console.error("Error al guardar pronósticos del jugador:", err);
      alert("Error al guardar tus pronósticos en la base de datos.");
    }
  }

  if (loading) return (
    <div style={{minHeight:"100vh",background:BG,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:14}}>
      <style>{`@keyframes sp{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
      <div style={{fontSize:52,animation:"sp 1s linear infinite"}}>⚽</div>
      <p style={{color:"#1e3a1e",fontFamily:"monospace",letterSpacing:4,fontSize:13}}>CARGANDO…</p>
    </div>
  );

  if (!sesion) return <Ingreso onEnter={(n,a)=>setSesion({nombre:n,isAdmin:a})}/>;
  if (sesion.isAdmin) return <VistaAdmin data={data} onSave={handleSaveAdmin} onLogout={()=>setSesion(null)}/>;
  return <VistaJugador jugador={sesion.nombre} data={data}
    onSave={handleSavePlayer}
    onLogout={()=>setSesion(null)}/>;
}
