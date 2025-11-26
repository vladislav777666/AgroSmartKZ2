// helper to call backend (assumes CONFIG.API_URL points to Render base, without trailing slash)
async function apiGet(path){
  const url = CONFIG.API_URL + "/api" + path;
  const res = await fetch(url);
  if(!res.ok) throw new Error(await res.text());
  return res.json();
}

// authorize Mini App (only in Telegram WebApp)
async function authMiniApp(){
  if(!window.Telegram || !window.Telegram.WebApp) return;
  const tg = window.Telegram.WebApp;
  const initData = tg.initData || "";
  if(!initData || initData.length < 10){
    // nothing to do if opened outside Telegram or initData not provided
    console.warn("No initData (not opened inside Telegram or empty).");
    return;
  }
  try{
    const res = await fetch(CONFIG.API_URL + "/api/auth?initData=" + encodeURIComponent(initData));
    if(!res.ok) throw new Error(await res.text());
    const j = await res.json();
    console.log("Auth:", j);
  }catch(e){
    console.warn("Auth failed:", e);
  }
}
authMiniApp();

// page loaders (main, prognoz, earts, sort, nastroi)
window.onPageLoad = async function(page){
  if(page === "main") {
    // init map events (simple SVG rectangles with ids d1..d5)
    const map = document.getElementById("kost-map");
    if(!map) return;
    const districts = {
      d1:{name:"Район А",soil:"Суглинок",rec:"Внести азот"},
      d2:{name:"Район Б",soil:"Песок",rec:"Полив"},
      d3:{name:"Район В",soil:"Супесь",rec:"Органика"},
      d4:{name:"Район Г",soil:"Чернозём",rec:"Подходит для пшеницы"},
      d5:{name:"Район Д",soil:"Суглинок",rec:"Мелкие улучшения"}
    };
    let tooltip = document.getElementById("map-tooltip");
    if(!tooltip){
      tooltip = document.createElement("div");
      tooltip.id = "map-tooltip";
      Object.assign(tooltip.style,{position:"fixed",zIndex:9999,padding:"8px",borderRadius:"6px",background:"rgba(0,0,0,0.8)",color:"#fff",fontSize:"13px",display:"none",pointerEvents:"none"});
      document.body.appendChild(tooltip);
    }

    Object.keys(districts).forEach(id=>{
      const el = document.getElementById(id);
      if(!el) return;
      el.addEventListener("mouseenter", e=>{
        el.setAttribute("fill-opacity","0.6");
        const d = districts[id];
        tooltip.innerHTML = `<b>${d.name}</b><br/>Тип почвы: ${d.soil}<br/>${d.rec}`;
        tooltip.style.display = "block";
      });
      el.addEventListener("mousemove", e=>{
        tooltip.style.left = (e.clientX + 12) + "px";
        tooltip.style.top = (e.clientY + 12) + "px";
      });
      el.addEventListener("mouseleave", ()=>{
        el.setAttribute("fill-opacity","1");
        tooltip.style.display = "none";
      });
      el.addEventListener("click", ()=>{
        sessionStorage.setItem("selectedDistrict", id);
        navigate("earts");
      });
    });
  }

  if(page === "prognoz"){
    const runBtn = document.getElementById("run-prog");
    const regionInput = document.getElementById("region-input");
    const daysInput = document.getElementById("days-input");
    const calendarWrap = document.getElementById("calendar-wrap");
    const listWrap = document.getElementById("favorable-list");
    const ctx = document.getElementById("weather-chart").getContext("2d");
    let chart;

    function renderCalendar(dates, favSet){
      const html = dates.map(d=>`<div class="cal-day ${favSet.has(d.iso)?'fav':''}" data-iso="${d.iso}"><div class="cal-date">${d.label}</div><div class="cal-temp">${d.temp===null?'-':d.temp+'°C'}</div></div>`).join('');
      calendarWrap.innerHTML = `<div class="calendar">${html}</div>`;
    }
    function renderList(fav){
      if(!fav.length){ listWrap.innerHTML = `<div class="card">Нет благоприятных дней</div>`; return; }
      listWrap.innerHTML = fav.map(d=>`<div class="card"><b>${d.label}</b> — ${d.temp}°C, ветер ${d.wind} м/с</div>`).join('');
    }
    async function fetchAndRender(){
      const region = encodeURIComponent(regionInput.value || "Костанай");
      const days = Number(daysInput.value) || 7;
      try{
        const data = await apiGet(`/window?region=${region}&days=${days}`);
        // build range of days from today
        const start = new Date();
        const dates = Array.from({length: Math.max(days,7)}, (_,i)=>{
          const d = new Date(start); d.setDate(start.getDate()+i);
          const iso = d.toISOString().slice(0,10);
          return {iso, label: iso.split('-').reverse().join('.'), temp: null, wind:null, rain:0};
        });
        const favSet = new Set();
        (data.favorable_days||[]).forEach(x=>{
          const parts = x.date.split('.');
          const iso = `${parts[2]}-${parts[1]}-${parts[0]}`;
          favSet.add(iso);
          const dd = dates.find(z=>z.iso===iso);
          if(dd){ dd.temp = x.temp; dd.wind = x.wind; dd.rain = x.rain||0; }
        });
        // chart
        const labels = dates.map(d=>d.label);
        const temps = dates.map(d=>d.temp===null?NaN:d.temp);
        if(chart) chart.destroy();
        chart = new Chart(ctx, {type:'line', data:{labels, datasets:[{label:'Темп °C', data:temps, tension:0.25, spanGaps:true}]}, options:{plugins:{legend:{display:false}}}});
        renderCalendar(dates, favSet);
        renderList(data.favorable_days||[]);
      }catch(e){
        calendarWrap.innerHTML = `<div class="card">Ошибка: ${e.message}</div>`;
      }
    }

    runBtn.addEventListener("click", fetchAndRender);
    await fetchAndRender();
  }

  if(page === "earts"){
    const form = document.getElementById("soil-form");
    const inputs = {
      ph: document.getElementById("inp-ph"),
      organic: document.getElementById("inp-organic"),
      moisture: document.getElementById("inp-moisture"),
      n: document.getElementById("inp-n"),
      p: document.getElementById("inp-p"),
      k: document.getElementById("inp-k")
    };
    const resultBox = document.getElementById("soil-result");
    const ctx = document.getElementById("soil-chart").getContext("2d");
    let barChart;

    function compute(values){
      const phScore = Math.max(0,100 - Math.abs(6.5 - values.ph)*15);
      const organicScore = Math.min(100, values.organic*2.5);
      const moistureScore = Math.min(100, values.moisture*2);
      const nScore = Math.min(100, values.n*1.2);
      const pScore = Math.min(100, values.p*1.2);
      const kScore = Math.min(100, values.k*1.2);
      const total = Math.round(phScore*0.25 + organicScore*0.2 + moistureScore*0.15 + nScore*0.15 + pScore*0.12 + kScore*0.13);
      return {total, breakdown:{phScore:Math.round(phScore), organicScore:Math.round(organicScore), moistureScore:Math.round(moistureScore), nScore:Math.round(nScore), pScore:Math.round(pScore), kScore:Math.round(kScore)}};
    }
    function render(values){
      const {total,breakdown} = compute(values);
      let rec = "Состояние удовлетворительное.";
      if(total<45) rec="Почва бедная: внесите органику и N.";
      else if(total<70) rec="Средняя плодородность: добавьте органику, следите за влажностью.";
      resultBox.innerHTML = `<div class="card"><h3>Итог: ${total}/100</h3><p>${rec}</p><ul><li>pH: ${breakdown.phScore}</li><li>Органика: ${breakdown.organicScore}</li><li>Влажность: ${breakdown.moistureScore}</li><li>N: ${breakdown.nScore}</li><li>P: ${breakdown.pScore}</li><li>K: ${breakdown.kScore}</li></ul></div>`;
      const labels = ["pH","Органика","Влажность","N","P","K"];
      const data = [breakdown.phScore,breakdown.organicScore,breakdown.moistureScore,breakdown.nScore,breakdown.pScore,breakdown.kScore];
      if(barChart) barChart.destroy();
      barChart = new Chart(ctx,{type:'bar',data:{labels,datasets:[{label:'Показатели',data}]},options:{plugins:{legend:{display:false}},scales:{y:{min:0,max:100}}}});
    }

    function read(){
      return {
        ph: parseFloat(inputs.ph.value) || 6.5,
        organic: parseFloat(inputs.organic.value) || 5,
        moisture: parseFloat(inputs.moisture.value) || 20,
        n: parseFloat(inputs.n.value) || 10,
        p: parseFloat(inputs.p.value) || 5,
        k: parseFloat(inputs.k.value) || 10
      };
    }

    Object.values(inputs).forEach(inp=>inp.addEventListener("input", ()=>render(read())));
    form.addEventListener("submit", e=>{ e.preventDefault(); render(read()); });

    const selected = sessionStorage.getItem("selectedDistrict");
    if(selected) document.getElementById("district-info").innerText = `Выбран район: ${selected}`;
    render(read());
  }

  if(page === "sort"){
    const cropSelect = document.getElementById("crop-select");
    const btn = document.getElementById("crop-run");
    const info = document.getElementById("sort-info");
    const districtIds = ["d1","d2","d3","d4","d5"];
    function clear(){
      districtIds.forEach(id=>{
        const el = document.getElementById(id);
        if(el){ el.setAttribute("stroke","#666"); el.setAttribute("stroke-width","1"); }
      });
    }
    btn.addEventListener("click", async ()=>{
      const crop = cropSelect.value || "пшеница";
      try{
        const res = await apiGet(`/sort?region=Костанай&crop=${encodeURIComponent(crop)}`);
        clear();
        const rnd = districtIds[Math.floor(Math.random()*districtIds.length)];
        const el = document.getElementById(rnd);
        if(el){ el.setAttribute("stroke","#0b84ff"); el.setAttribute("stroke-width","3"); el.setAttribute("fill-opacity","0.7"); }
        info.innerHTML = `<div class="card"><b>Культура:</b> ${res.crop}<br/><b>Рекомендуемый сорт:</b> ${res.recommended_variety}<br/><b>Характеристики:</b> ${res.features}</div>`;
      }catch(e){
        info.innerHTML = `<div class="card">Ошибка: ${e.message}</div>`;
      }
    });
  }

  if(page === "nastroi"){
    const el = document.getElementById("nastroi-box");
    if(el) el.innerHTML = `<div class="card">Настройки: язык, профиль, экспорт.</div>`;
  }
};
