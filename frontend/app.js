// API helpers
const API_HOST = CONFIG.API_HOST;
const API_PREFIX = API_HOST + "/api";

async function apiGet(path){
  const res = await fetch(API_PREFIX + path);
  if(!res.ok) throw new Error(await res.text());
  return res.json();
}
async function apiPost(path, body){
  const res = await fetch(API_PREFIX + path, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
  if(!res.ok) throw new Error(await res.text());
  return res.json();
}

// Try auth with Telegram initData (if exists)
async function authMiniApp(){
  if(!(window.Telegram && window.Telegram.WebApp)) return;
  const tg = window.Telegram.WebApp;
  const initData = tg.initData || "";
  if(!initData || initData.length < 8) return;
  try{
    await fetch(API_PREFIX + "/auth?initData=" + encodeURIComponent(initData));
    console.log("Auth OK");
  }catch(e){
    console.warn("Auth failed", e);
  }
}
authMiniApp();

// onPageLoad with interactive handlers
window.onPageLoad = async function(page){
  function bindBack(){
    document.querySelectorAll('.btn-back').forEach(b=>b.addEventListener('click', ()=>navigate('main')));
  }

  if(page === "main"){
    // Regions info (17 regions)
    const REG = {
      r1:{name:"Акмолинская", soil:"Суглинок/чернозём", crops:["пшеница","ячмень"]},
      r2:{name:"Актюбинская", soil:"Супесь/песок", crops:["пшеница","подсолнечник"]},
      r3:{name:"Атырауская", soil:"Песок/суглинок", crops:["подсолнечник"]},
      r4:{name:"Алматинская", soil:"Чернозём", crops:["подсолнечник","пшеница"]},
      r5:{name:"Актобе/область", soil:"Суглинок", crops:["пшеница"]},
      r6:{name:"Костанайская", soil:"Суглинок", crops:["пшеница","ячмень"]},
      r7:{name:"Павлодарская", soil:"Супесь", crops:["пшеница"]},
      r8:{name:"Карагандинская", soil:"Супесь", crops:["ячмень"]},
      r9:{name:"ВКО", soil:"Чернозём", crops:["подсолнечник"]},
      r10:{name:"ЮКО/Туркестан", soil:"Чернозём", crops:["пшеница","подсолнечник"]},
      r11:{name:"Жамбылская", soil:"Суглинок", crops:["пшеница"]},
      r12:{name:"Кызылординская", soil:"Песок", crops:["подсолнечник"]},
      r13:{name:"Мангыстау", soil:"Песок", crops:["подсолнечник"]},
      r14:{name:"ЗКО", soil:"Суглинок", crops:["пшеница"]},
      r15:{name:"СКО", soil:"Суглинок", crops:["пшеница"]},
      r16:{name:"Абайская", soil:"Супесь", crops:["ячмень"]},
      r17:{name:"Жетысу", soil:"Чернозём", crops:["пшеница"]}
    };

    // tooltip
    let t = document.getElementById('map-tooltip');
    if(!t){ t = document.createElement('div'); t.id='map-tooltip'; document.body.appendChild(t); Object.assign(t.style,{position:'fixed',display:'none',padding:'8px',borderRadius:'8px',background:'rgba(3,9,18,0.9)',color:'#e6f8ff',fontSize:'13px',zIndex:9999})}

    Object.keys(REG).forEach(id=>{
      const el = document.getElementById(id);
      if(!el) return;
      el.classList.add('region');
      el.addEventListener('mouseenter', e=>{
        t.innerHTML = `<b>${REG[id].name}</b><div style="color:var(--muted);margin-top:6px">Почва: ${REG[id].soil}<br>Рекомендуемые: ${REG[id].crops.join(', ')}</div>`;
        t.style.display='block';
      });
      el.addEventListener('mousemove', e=>{ t.style.left=(e.clientX+12)+'px'; t.style.top=(e.clientY+12)+'px'; });
      el.addEventListener('mouseleave', ()=> t.style.display='none');
      el.addEventListener('click', async ()=>{
        document.querySelectorAll('svg.kazakh .region').forEach(r=>r.classList.remove('active'));
        el.classList.add('active');
        const info = document.getElementById('region-info');
        info.innerHTML = `<div class="region-info"><b>${REG[id].name}</b><div style="color:var(--muted);margin-top:8px">Почва: ${REG[id].soil}<br>Культуры: ${REG[id].crops.join(', ')}<br><div style="margin-top:8px"><button class="btn" onclick="navigate('earts'); sessionStorage.setItem('selectedRegion','${id}')">Открыть анализ</button></div></div></div>`;
      });
    });

    bindBack();
  }

  // PROGNOZ (only favorable days + big chart)
  if(page === "prognoz"){
    bindBack();
    const runBtn = document.getElementById('run-prog');
    const regionInput = document.getElementById('region-input');
    const daysInput = document.getElementById('days-input');
    const calendarWrap = document.getElementById('calendar-wrap');
    const listWrap = document.getElementById('favorable-list');
    const canvas = document.getElementById('weather-chart');
    canvas.height = 320;
    let chart;

    function renderFavs(favs){
      if(!favs || favs.length===0){ calendarWrap.innerHTML='<div class="card">Нет благоприятных дней</div>'; listWrap.innerHTML=''; if(chart){chart.destroy(); chart=null;} return; }
      calendarWrap.innerHTML = favs.map(d=>`<div class="cal-item ${d.temp>=18 && d.temp<=22 ? 'good':''}"><div class="date">${d.date}</div><div class="meta">${d.temp}°C · ветер ${d.wind} м/с</div></div>`).join('');
      listWrap.innerHTML = favs.map(d=>`<div class="card">${d.date} — ${d.temp}°C — ${d.wind} м/с</div>`).join('');
      // chart
      if(chart) chart.destroy();
      const labels = favs.map(d=>d.date);
      const temps = favs.map(d=>d.temp);
      const winds = favs.map(d=>d.wind);
      chart = new Chart(canvas.getContext('2d'), { type:'bar', data:{labels,datasets:[{label:'Температура °C', data:temps, backgroundColor:'rgba(11,132,255,0.7)'},{label:'Ветер м/с', data:winds, backgroundColor:'rgba(120,200,120,0.6)'}]}, options:{responsive:true, plugins:{legend:{labels:{color:'#e6eef7'}}}, scales:{y:{ticks:{color:'#e6eef7'}}}}});
    }

    async function fetchAndRender(){
      try{
        const region = encodeURIComponent(regionInput.value||'Костанай');
        const days = Number(daysInput.value)||7;
        const res = await apiGet(`/window?region=${region}&days=${days}`);
        renderFavs(res.favorable_days || []);
      }catch(e){
        calendarWrap.innerHTML = `<div class="card">Ошибка: ${e.message}</div>`;
      }
    }
    runBtn.addEventListener('click', fetchAndRender);
    await fetchAndRender();
  }

  // EARTS (soil analysis)
  if(page === "earts"){
    bindBack();
    const form = document.getElementById('soil-form');
    const inputs = { ph: document.getElementById('inp-ph'), organic: document.getElementById('inp-organic'), moisture: document.getElementById('inp-moisture'), n: document.getElementById('inp-n'), p: document.getElementById('inp-p'), k: document.getElementById('inp-k') };
    const resultBox = document.getElementById('soil-result'); const canvas = document.getElementById('soil-chart'); canvas.height = 360;
    let chart;

    function compute(vals){
      const phScore = Math.max(0,100 - Math.abs(6.5 - vals.ph)*20);
      const organicScore = Math.min(100,(vals.organic/8)*100);
      const moistureScore = Math.max(0,100 - Math.abs(26 - vals.moisture)*3);
      const nScore = Math.min(100,(vals.n/60)*100);
      const pScore = Math.min(100,(vals.p/20)*100);
      const kScore = Math.min(100,(vals.k/150)*100);
      const total = Math.round(phScore*0.20 + organicScore*0.20 + moistureScore*0.15 + nScore*0.15 + pScore*0.15 + kScore*0.15);
      const issues=[];
      if(vals.ph<5.5) issues.push("низкий pH: известкование");
      if(vals.ph>7.5) issues.push("высокий pH: учесть доступность P");
      if(vals.organic<3) issues.push("мало органики");
      if(vals.moisture<12) issues.push("сухо — полив");
      if(vals.n<20) issues.push("низкий N");
      if(vals.p<8) issues.push("низкий P");
      if(vals.k<50) issues.push("низкий K");
      return {total, breakdown:{phScore:Math.round(phScore), organicScore:Math.round(organicScore), moistureScore:Math.round(moistureScore), nScore:Math.round(nScore), pScore:Math.round(pScore), kScore:Math.round(kScore)}, issues};
    }

    function render(vals){
      const r = compute(vals);
      resultBox.innerHTML = `<div class="card"><div style="display:flex;gap:12px"><div style="width:120px;height:120px;border-radius:12px;background:linear-gradient(180deg,#072233,#073046);display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700">${r.total}</div><div style="flex:1"><b>Рекомендации</b><div style="color:var(--muted);margin-top:8px">${r.issues.length?'<ul>'+r.issues.map(i=>`<li>${i}</li>`).join('')+'</ul>':'Параметры в норме'}</div></div></div></div>`;
      const labels=["pH","Органика","Влажность","N","P","K"];
      const data=[r.breakdown.phScore,r.breakdown.organicScore,r.breakdown.moistureScore,r.breakdown.nScore,r.breakdown.pScore,r.breakdown.kScore];
      if(chart) chart.destroy();
      chart = new Chart(canvas.getContext('2d'), {type:'radar', data:{labels,datasets:[{label:'показатели',data,backgroundColor:'rgba(11,132,255,0.14)',borderColor:'rgba(11,132,255,0.9)'}]}, options:{scales:{r:{pointLabels:{color:'#e6eef7'}}}, plugins:{legend:{display:false}}}});
    }

    Object.values(inputs).forEach(i=>i.addEventListener('input', ()=>render({ph:parseFloat(inputs.ph.value),organic:parseFloat(inputs.organic.value),moisture:parseFloat(inputs.moisture.value),n:parseFloat(inputs.n.value),p:parseFloat(inputs.p.value),k:parseFloat(inputs.k.value)})));
    form.addEventListener('submit', async e=>{ e.preventDefault(); const vals={ph:parseFloat(inputs.ph.value),organic:parseFloat(inputs.organic.value),moisture:parseFloat(inputs.moisture.value),n:parseFloat(inputs.n.value),p:parseFloat(inputs.p.value),k:parseFloat(inputs.k.value)}; render(vals); try{ await apiPost('/save_soil', {user_id: window.Telegram && window.Telegram.WebApp ? (window.Telegram.WebApp.initDataUnsafe && window.Telegram.WebApp.initDataUnsafe.user ? window.Telegram.WebApp.initDataUnsafe.user.id : null) : null, region: sessionStorage.getItem('selectedRegion')||'unknown', values: vals}); }catch(err){ console.warn('Save soil failed', err) } });
    const sel = sessionStorage.getItem('selectedRegion'); if(sel) document.getElementById('district-info').innerText = 'Выбран район: ' + sel;
    render({ph:6.5,organic:5,moisture:20,n:10,p:5,k:10});
    bindBack();
  }

  // SORT
  if(page === "sort"){
    bindBack();
    const PREFER = {
      "пшеница":["r6","r15","r1","r8"],
      "ячмень":["r8","r16","r6"],
      "подсолнечник":["r4","r9","r12"]
    };
    const cropSelect = document.getElementById('crop-select');
    const runBtn = document.getElementById('crop-run');
    const info = document.getElementById('sort-info');

    runBtn.addEventListener('click', async ()=>{
      const crop = cropSelect.value;
      document.querySelectorAll('svg.kazakh .region').forEach(r=>{ r.classList.remove('prefer'); r.classList.remove('active'); r.setAttribute('stroke','#123141'); r.setAttribute('stroke-width','1'); });
      (PREFER[crop]||[]).forEach(id=>{ const el = document.getElementById(id); if(el){ el.classList.add('prefer'); el.setAttribute('stroke','#a7ffcb'); el.setAttribute('stroke-width','2'); }});
      try{
        const res = await apiGet(`/sort?region=Костанай&crop=${encodeURIComponent(crop)}`);
        info.innerHTML = `<div class="card"><b>Культура:</b> ${crop}<br><b>Сорт:</b> ${res.recommended_variety}<div style="color:var(--muted);margin-top:8px">${res.features}</div></div>`;
      }catch(e){
        info.innerHTML = `<div class="card">Ошибка получения сорта: ${e.message}</div>`;
      }
    });
  }

  // NASTROI (profile & subscription)
  if(page === "nastroi"){
    bindBack();
    const btn = document.getElementById('subscribe-btn');
    const userId = window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe && window.Telegram.WebApp.initDataUnsafe.user ? window.Telegram.WebApp.initDataUnsafe.user.id : null;
    document.getElementById('profile-id').innerText = userId ? `Ваш Telegram ID: ${userId}` : 'ID: неизвестен (открой в Telegram)';
    btn.addEventListener('click', ()=>{ alert('Чтобы оформить подписку напиши @Geniys666 (вручную)'); });
  }
};
// Router