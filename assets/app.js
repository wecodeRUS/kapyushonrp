(function(){
  const qs=(s,r=document)=>r.querySelector(s);
  const qsa=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const byId=(id)=>document.getElementById(id);
  const safeText=(v)=>v===0?"0":(v?String(v):"-");
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const base=(()=>{
    const p=location.pathname.split('/');
    const last=p[p.length-1]||"index.html";
    return last;
  })();
  qsa('.nav a').forEach(a=>{
    const href=a.getAttribute('href')||"";
    if(href===base) a.classList.add('active');
  });
  qsa('[data-linkstub]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();}));
  const y=byId('year');
  if(y) y.textContent=String(new Date().getFullYear());

  const apiBase=(()=>{
    const path=location.pathname;
    if(path.endsWith('/')) return 'api/';
    const parts=path.split('/');
    parts.pop();
    const prefix=parts.join('/');
    return (prefix?prefix+'/':'')+'api/';
  })();

  const fetchJson=async(url)=>{
    const r=await fetch(url,{cache:'no-store'});
    if(!r.ok) throw new Error('HTTP');
    return await r.json();
  };

  const fmtMoney=(n)=>{
    const x=Number(n);
    if(!isFinite(x)) return safeText(n);
    return x.toLocaleString('ru-RU');
  };

  const parseTime=(v)=>{
    if(!v) return null;
    if(typeof v==='number'){
      if(v>1e12) return new Date(v);
      if(v>1e9) return new Date(v*1000);
      return null;
    }
    const d=new Date(v);
    if(String(d)==='Invalid Date') return null;
    return d;
  };

  const rel=(d)=>{
    if(!d) return '-';
    const ms=Date.now()-d.getTime();
    const s=Math.floor(ms/1000);
    if(s<0) return '-';
    if(s<60) return s+' сек назад';
    const m=Math.floor(s/60);
    if(m<60) return m+' мин назад';
    const h=Math.floor(m/60);
    if(h<24) return h+' ч назад';
    const day=Math.floor(h/24);
    return day+' д назад';
  };

  const copyText=async(t)=>{
    try{
      await navigator.clipboard.writeText(t);
      return true;
    }catch(_){
      const ta=document.createElement('textarea');
      ta.value=t;
      ta.style.position='fixed';
      ta.style.left='-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      let ok=false;
      try{ ok=document.execCommand('copy'); }catch(__){}
      document.body.removeChild(ta);
      return ok;
    }
  };

  const wireCopyIp=(ip)=>{
    const b=byId('copyIp');
    if(!b) return;
    if(!ip){
      b.disabled=true;
      return;
    }
    b.disabled=false;
    b.textContent='Скопировать IP';
    b.onclick=async()=>{
      const ok=await copyText(ip);
      b.textContent=ok?'Скопировано':'Скопировать IP';
      window.setTimeout(()=>{b.textContent='Скопировать IP';},1200);
    };
  };

  const mountLive=(rootId,textId,when)=>{
    const root=byId(rootId);
    const t=byId(textId);
    if(!root||!t) return;
    root.style.opacity=1;
    const d=parseTime(when);
    t.textContent=d?rel(d):'-';
  };

  const runIndex=()=>{
    const srv=async()=>{
      try{
        const d=await fetchJson(apiBase+'server.php');
        if(!d||!d.ok) return;
        byId('srvStatus').textContent=d.online>0?'Онлайн':'Оффлайн';
        byId('srvOnline').textContent=safeText(d.online)+'/'+safeText(d.max);
        byId('srvMap').textContent=safeText(d.map);
        byId('srvAddress').textContent=safeText(d.connect);
        const lu=parseTime(d.last_update);
        byId('srvUpdated').textContent=lu?rel(lu):'-';
        wireCopyIp(d.connect);
      }catch(_){ }
    };

    const players=async()=>{
      try{
        const d=await fetchJson(apiBase+'players.php');
        if(!d||!d.ok) return;
        const list=Array.isArray(d.players)?d.players:[];
        const tbody=byId('playersTbody');
        if(!tbody) return;
        const search=byId('playersSearch');
        const count=byId('playersCount');
        const liveText=byId('playersUpdated');
        const liveRoot=byId('playersLive');
        if(liveRoot) liveRoot.style.opacity=1;
        if(liveText){
          const lu=parseTime(d.last_update||d.updated_at);
          liveText.textContent=lu?rel(lu):'-';
        }
        const norm=list.map(p=>({
          name:safeText(p.name||p.nickname||p.player||p),
          raw:p
        })).filter(x=>x.name&&x.name!=='-');
        norm.sort((a,b)=>a.name.localeCompare(b.name,'ru'));
        const render=(q)=>{
          const qq=(q||'').trim().toLowerCase();
          const rows=qq?norm.filter(x=>x.name.toLowerCase().includes(qq)):norm;
          if(rows.length===0){
            tbody.innerHTML='<tr><td colspan="2" class="muted">Нет данных</td></tr>';
            if(count) count.textContent='0';
            return;
          }
          tbody.innerHTML=rows.map((x,i)=>{
            const n=String(i+1);
            const nm=x.name.replace(/</g,'&lt;').replace(/>/g,'&gt;');
            return '<tr><td>'+n+'</td><td>'+nm+'</td></tr>';
          }).join('');
          if(count) count.textContent=String(rows.length);
        };
        render(search?search.value:'');
        if(search){
          search.oninput=()=>render(search.value);
        }
      }catch(_){ }
    };

    srv();
    players();
    window.setInterval(srv,10000);
    window.setInterval(players,10000);
  };

  const runStaff=()=>{
    const grid=byId('staffGrid');
    if(!grid) return;
    const search=byId('staffSearch');
    const filters=byId('staffFilters');
    const refresh=byId('refreshStaff');
    let data=[];
    let filter='all';

    const card=(p)=>{
      const name=safeText(p.name);
      const role=safeText(p.role);
      const lastRaw=safeText(p.last_seen);
      const online=!!p.online;
      const last=online?'Сейчас в сети':lastRaw;
      const av=(name&&name!=='-')?name.trim().slice(0,1).toUpperCase():'?';
      const badges=[
        '<span class="badge '+(online?'ok':'')+'">'+(online?'Онлайн':'Оффлайн')+'</span>',
        role!=='-'?'<span class="badge role">'+role.replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</span>':'',
        last!=='-'?'<span class="badge">'+last.replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</span>':''
      ].filter(Boolean).join('');
      return '<div class="card staff-card">'+
        '<div class="staff-main">'+
          '<div class="avatar">'+av.replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</div>'+
          '<div class="staff-info">'+
            '<div class="staff-name">'+name.replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</div>'+
            '<div class="staff-sub">'+badges+'</div>'+
          '</div>'+
        '</div>'+
      '</div>';
    };

    const apply=()=>{
      const q=(search?search.value:'').trim().toLowerCase();
      let rows=data;
      if(filter==='online') rows=rows.filter(x=>x.online);
      if(filter==='offline') rows=rows.filter(x=>!x.online);
      if(q) rows=rows.filter(x=>String(x.name||'').toLowerCase().includes(q) || String(x.role||'').toLowerCase().includes(q));
      if(rows.length===0){
        grid.innerHTML='<div class="muted" style="padding:12px">Нет данных</div>';
        return;
      }
      grid.innerHTML=rows.map(card).join('');
    };

    const load=async()=>{
      try{
        const d=await fetchJson(apiBase+'staff.php');
        if(!d||!d.ok) return;
        data=Array.isArray(d.staff)?d.staff:[];
        mountLive('staffLive','staffUpdated',d.updated_at||d.last_update);
        apply();
      }catch(_){ }
    };

    if(search) search.oninput=apply;
    if(filters){
      qsa('.pill',filters).forEach(p=>{
        p.addEventListener('click',()=>{
          qsa('.pill',filters).forEach(x=>x.classList.remove('active'));
          p.classList.add('active');
          filter=p.getAttribute('data-filter')||'all';
          apply();
        });
      });
    }
    if(refresh) refresh.onclick=load;
    load();
    window.setInterval(load,30000);
  };


  const runBans=()=>{
    const tbody=byId('bansTbody');
    if(!tbody) return;
    const search=byId('bansSearch');
    const live=byId('bansLive');
    const updated=byId('bansUpdated');
    const refresh=byId('refreshBans');
    let data=[];

    const row=(b)=>{
      const who=safeText(b.player);
      const why=safeText(b.reason);
      const by=safeText(b.admin);
      const date=safeText(b.date);
      const len=safeText(b.length);
      return '<tr>'+
        '<td>'+escapeHtml(who)+'</td>'+
        '<td>'+escapeHtml(why)+'</td>'+
        '<td>'+escapeHtml(by)+'</td>'+
        '<td>'+escapeHtml(date)+'</td>'+
        '<td>'+escapeHtml(len)+'</td>'+
      '</tr>';
    };

    const apply=()=>{
      const q=(search?search.value:'').trim().toLowerCase();
      let rows=data;
      if(q){
        rows=rows.filter(b=>{
          const s=(String(b.player||'')+' '+String(b.reason||'')+' '+String(b.admin||'')+' '+String(b.steamid||'')).toLowerCase();
          return s.includes(q);
        });
      }
      tbody.innerHTML = rows.length ? rows.map(row).join('') : '<tr><td colspan="5" class="muted">Нет данных</td></tr>';
    };

    const load=async()=>{
      try{
        const j=await fetchJson('api/bans.php');
        const arr=(j && Array.isArray(j.bans))?j.bans:[];
        data=arr;
        const t=j && j.updated_at?new Date(j.updated_at*1000):null;
        if(updated) updated.textContent=t?fmtAgo(t):'-';
        if(live) live.style.opacity=arr.length?1:0;
        apply();
      }catch(e){
        tbody.innerHTML='<tr><td colspan="5" class="muted">Ошибка загрузки</td></tr>';
      }
    };

    if(search) search.oninput=apply;
    if(refresh) refresh.onclick=load;
    load();
    window.setInterval(load,30000);
  };


  const runEco=()=>{
    const tbody=byId('ecoTbody');
    const top3=byId('top3');
    if(!tbody||!top3) return;
    const search=byId('ecoSearch');
    const count=byId('ecoCount');
    const refresh=byId('refreshEco');
    let data=[];

    const fmtPlay=(v)=>{
      if(!v) return '-';
      const n=Number(v);
      if(isFinite(n)){
        const sec=n>1e6?Math.floor(n):Math.floor(n);
        const h=Math.floor(sec/3600);
        const m=Math.floor((sec%3600)/60);
        if(h>0) return h+'ч '+m+'м';
        return m+'м';
      }
      return String(v);
    };

    const renderTop3=(rows)=>{
      const top=rows.slice(0,3);
      top3.innerHTML=top.map((p,i)=>{
        const rank=i+1;
        const name=safeText(p.nickname||p.name);
        const money=fmtMoney(p.money);
        return '<div class="card">'+
          '<div class="glow"></div>'+
          '<div class="rank">#'+rank+'</div>'+
          '<div style="font-weight:850; white-space:nowrap; overflow:hidden; text-overflow:ellipsis">'+name.replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</div>'+
          '<div class="money">'+money+'</div>'+
        '</div>';
      }).join('');
    };

    const apply=()=>{
      const q=(search?search.value:'').trim().toLowerCase();
      let rows=data;
      if(q) rows=rows.filter(x=>{
        const s=(String(x.nickname||x.name||'')+' '+String(x.steamid||'')).toLowerCase();
        return s.includes(q);
      });
      if(rows.length===0){
        top3.innerHTML='<div class="muted" style="padding:12px">Нет данных</div>';
        tbody.innerHTML='<tr><td colspan="5" class="muted">Нет данных</td></tr>';
        if(count) count.textContent='0';
        return;
      }
      renderTop3(rows);
      tbody.innerHTML=rows.map((p,i)=>{
        const place=String(i+1);
        const name=safeText(p.nickname||p.name);
        const sid=safeText(p.steamid);
        const time=fmtPlay(p.playtime||p.time);
        const money=fmtMoney(p.money);
        return '<tr>'+
          '<td>'+place+'</td>'+
          '<td>'+name.replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</td>'+
          '<td>'+sid.replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</td>'+
          '<td>'+time.replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</td>'+
          '<td>'+money+'</td>'+
        '</tr>';
      }).join('');
      if(count) count.textContent=String(rows.length);
    };

    const load=async()=>{
      try{
        const d=await fetchJson(apiBase+'economy.php');
        if(!d||!d.ok) return;
        data=Array.isArray(d.players)?d.players:[];
        data.sort((a,b)=>Number(b.money||0)-Number(a.money||0));
        mountLive('ecoLive','ecoUpdated',d.updated_at||d.last_update);
        apply();
      }catch(_){ }
    };

    if(search) search.oninput=apply;
    if(refresh) refresh.onclick=load;
    load();
    window.setInterval(load,60000);
  };

  const runRules=()=>{
    const toc=byId('rulesTocLinks');
    const content=byId('rulesContent');
    if(!toc||!content) return;
    const search=byId('rulesSearch');
    const ver=byId('rulesVersion');
    const refresh=byId('refreshRules');
    let data=null;

    const slug=(s)=>{
      const t=String(s||'').toLowerCase().replace(/[^a-z0-9а-яё]+/gi,'-').replace(/-+/g,'-').replace(/^-|-$/g,'');
      return t||('s'+Math.random().toString(16).slice(2));
    };

    const renderTree=(nodes)=>{
      if(!nodes||!nodes.length) return '';
      const li=(n)=>{
        const txt=safeText(n.text);
        const id=slug((n.code||'')+'-'+txt.slice(0,40));
        const head='<div class="card rule-card" id="'+id+'">'+
          '<div class="rule-title">'+(n.code?String(n.code).replace(/</g,'&lt;').replace(/>/g,'&gt;')+' ':'')+txt.replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</div>'+
        '</div>';
        const kids=renderTree(n.children);
        return head+(kids?'<div style="margin-left:14px">'+kids+'</div>':'');
      };
      return nodes.map(li).join('');
    };

    const apply=()=>{
      if(!data) return;
      const q=(search?search.value:'').trim().toLowerCase();
      const sections=Array.isArray(data.sections)?data.sections:[];
      const filtered=sections.map(s=>{
        const items=s.items||[];
        if(!q) return s;
        const keep=(node)=>{
          const hit=(String(node.text||'')+' '+String(node.code||'')).toLowerCase().includes(q);
          const kids=(node.children||[]).map(keep).filter(Boolean);
          if(hit||kids.length) return Object.assign({},node,{children:kids});
          return null;
        };
        const kept=items.map(keep).filter(Boolean);
        const hitTitle=String(s.title||'').toLowerCase().includes(q);
        return Object.assign({},s,{items:hitTitle?items:kept});
      }).filter(s=>q?((s.items||[]).length>0 || String(s.title||'').toLowerCase().includes(q)):true);

      if(filtered.length===0){
        toc.innerHTML='<div class="muted" style="padding:12px">Нет данных</div>';
        content.innerHTML='<div class="muted" style="padding:12px">Нет данных</div>';
        return;
      }

      toc.innerHTML=filtered.map((s,i)=>{
        const id=s.id||('sec-'+(i+1));
        const t=safeText(s.title);
        return '<a href="#'+id+'">'+t.replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</a>';
      }).join('');

      content.innerHTML=filtered.map((s,i)=>{
        const id=s.id||('sec-'+(i+1));
        const t=safeText(s.title);
        const inner=renderTree(s.items||[]);
        return '<div class="card padded" id="'+id+'" style="margin-bottom:12px">'+
          '<div class="rule-head">'+
            '<div><h2 style="margin:0">'+t.replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</h2></div>'+
            '<button class="btn" type="button" data-copy="'+id+'">Ссылка</button>'+
          '</div>'+
          '<div style="margin-top:12px">'+inner+'</div>'+
        '</div>';
      }).join('');

      qsa('[data-copy]').forEach(b=>{
        b.onclick=async()=>{
          const id=b.getAttribute('data-copy');
          const u=location.origin+location.pathname+'#'+id;
          await copyText(u);
        };
      });

      qsa('#rulesTocLinks a').forEach(a=>{
        a.addEventListener('click',()=>{
          qsa('#rulesTocLinks a').forEach(x=>x.classList.remove('active'));
          a.classList.add('active');
        });
      });
    };

    const load=async()=>{
      try{
        const d=await fetchJson(apiBase+'rules.php');
        if(!d||!d.ok) return;
        data=d;
        if(ver) ver.textContent=safeText(d.version||d.changed_at);
        mountLive('rulesLive','rulesUpdated',d.updated_at||d.last_update);
        apply();
      }catch(_){ }
    };

    if(search) search.oninput=apply;
    if(refresh) refresh.onclick=load;
    load();
    window.setInterval(load,6*60*60*1000);
  };

  if(base==='index.html' || base==='') runIndex();
  if(base==='staff.html') runStaff();
  if(base==='bans.html') runBans();
  if(base==='economy.html') runEco();
  if(base==='rules.html') runRules();
})();
