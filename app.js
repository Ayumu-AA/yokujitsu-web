"use strict";
// アプリの版。画面・コードを変えたら、sw.js の CACHE と index.html の ?v= も一緒に増やす。
// 画面の一番下に表示されるので、古いキャッシュのままかどうかを見分けられる。
const APP_VERSION = "v7（ジャンルの追加・名前変更・削除）";
// 日付とJavaの対応：LocalDate → YYYY-MM-DD形式の文字列。
const $ = id => document.getElementById(id);
// ジャンルは空から始まり、利用者が自分で追加する。
// 下の4つは旧版で固定だった科目。旧版の記録（subject が java / eng / math / hist）を読むとき、
// その記録にジャンルの名前を付けるためだけに使う。idは記録と結び付く値なので変更しない。
const LEGACY_GENRES = [{id:"java",name:"Java"},{id:"eng",name:"英語"},{id:"math",name:"数学"},{id:"hist",name:"日本史"}];
const GENRE_NAME_MAX = 30;  // ジャンル名の上限（文字数）
const GENRE_LIMIT = 1000;   // ジャンルの数の上限
const ALL = "";             // 絞り込みの「すべて」。ジャンルのidは空文字にならないので重ならない。
function localDay() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function isDate(text) {
  if (typeof text !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const d = new Date(text + "T00:00:00Z");
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === text;
}
function addDays(text, count) {
  if (!isDate(text)) throw new Error("日付が不正です");
  const d = new Date(text + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + count);
  return d.toISOString().slice(0,10);
}
let today = localDay();
function notice(text, error = false) {
  $("notice").textContent = text;
  $("notice").classList.toggle("error", error);
}
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function seedRecords() {
  return [
    {id:"math-demo",subject:"math",title:"二次関数の最大・最小",content:"平方完成を使って考える。",studied:addDays(today,-2),review:addDays(today,-1),status:"pending",doneAt:null,q:"y = x² − 4x + 1 の最小値は？",a:"x = 2 のとき最小値 −3",postponed:0},
    {id:"java-demo",subject:"java",title:"for文とwhile文の使い分け",content:"回数が決まっていないときはwhile文。",studied:addDays(today,-1),review:today,status:"pending",doneAt:null,q:"回数が決まっていない繰り返しに向くのは？",a:"while文",postponed:0},
    {id:"eng-demo",subject:"eng",title:"英単語：動詞30語",content:"例文とセットで覚える。",studied:addDays(today,-1),review:today,status:"pending",doneAt:null,q:"attribute A to B の意味は？",a:"AをBのせい（おかげ）にする",postponed:0},
    {id:"hist-demo",subject:"hist",title:"鎌倉幕府と執権政治",content:"承久の乱と六波羅探題の役割を整理。",studied:addDays(today,-1),review:today,status:"pending",doneAt:null,q:"",a:"",postponed:0}
  ];
}
// ジャンル担当。名前（表示用）とid（記録との結び付き用）を分けて扱う。
// 記録の subject には、ジャンルの名前ではなく id が入る。
// 名前を整える：前後の空白を除き、途中の連続した空白・改行は1つの空白にそろえる。
function cleanGenreName(text) {
  return String(text).replace(/[\u0000-\u001f\u007f-\u009f]/g," ").replace(/\s+/g," ").trim();
}
// 重複判定用の形：全角半角・大文字小文字・空白の違いをなくす。
function genreKey(text) {
  return String(text).normalize("NFKC").toLowerCase().replace(/[\s\p{Cf}]/gu,"");
}
// 検索用の形：重複判定の形に加えて、カタカナをひらがなに寄せる。
function searchKey(text) {
  return genreKey(text).replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60));
}
function genreName(id) {
  const genre=data.genres.find(g=>g.id===id);
  return genre ? genre.name : "不明なジャンル";
}
function hasGenre(id) {
  return data.genres.some(g=>g.id===id);
}
// 使える名前か調べる。使えるなら整えた名前を、使えないなら日本語の理由を返す。
// 名前を変更するときは selfId にそのジャンルのidを渡す（自分自身とは重複と数えない）。
function checkGenreName(text,selfId="") {
  const name=cleanGenreName(text), key=genreKey(name), length=[...name].length;
  if(!key)return {ok:false,error:"ジャンルの名前を入力してください。"};
  if(length>GENRE_NAME_MAX)return {ok:false,error:`ジャンルの名前は${GENRE_NAME_MAX}文字までです（いま${length}文字）。`};
  const same=data.genres.find(g=>g.id!==selfId&&genreKey(g.name)===key);
  if(same)return {ok:false,error:`「${same.name}」がすでにあります。同じ名前のジャンルは使えません。`};
  return {ok:true,name};
}
function newId() {
  if(crypto.randomUUID)return crypto.randomUUID();
  return [...crypto.getRandomValues(new Uint8Array(16))].map(n=>n.toString(16).padStart(2,"0")).join("");
}
function addGenre(text) {
  const check=checkGenreName(text);if(!check.ok)return check;
  if(data.genres.length>=GENRE_LIMIT)return {ok:false,error:`ジャンルは${GENRE_LIMIT}個までです。`};
  let id="g-"+newId();while(hasGenre(id))id="g-"+newId();
  const genre={id,name:check.name};
  const next=structuredClone(data);next.genres.push(genre);
  if(!commit(next))return {ok:false,error:"保存できなかったため、ジャンルは追加していません。"};
  return {ok:true,genre};
}
// 名前だけを変える。idは変えないので、記録との結び付きはそのまま残る。
function renameGenre(id,text) {
  const old=data.genres.find(g=>g.id===id);
  if(!old)return {ok:false,error:"このジャンルは見つかりません。"};
  const check=checkGenreName(text,id);if(!check.ok)return check;
  if(check.name===old.name)return {ok:true,genre:old,oldName:old.name,changed:false};
  const next=structuredClone(data);
  next.genres.find(g=>g.id===id).name=check.name;
  if(!commit(next))return {ok:false,error:"保存できなかったため、名前は変更していません。"};
  return {ok:true,genre:data.genres.find(g=>g.id===id),oldName:old.name,changed:true};
}
// 保存担当。Javaのファイル入出力をブラウザ内保存へ置き換える。
// 保存場所（キー）は旧形式と同じ。中身の version で形式を見分ける（下の upgradeData を参照）。
// この version は保存形式の番号で、アプリの版（APP_VERSION）とは別のもの。
const DATA_KEY="yokujitsu.records.v1";
// 旧形式から初めて書き換える直前の内容を、ここへ控えておく。
const LEGACY_KEY="yokujitsu.records.v1.before-genres";
let storageBlocked=false;
let originalText="";
let legacyText="";
function emptyData() {
  return {version:3,genres:[],records:[],activity:{}};
}
function validGenres(genres) {
  if(!Array.isArray(genres)||genres.length>GENRE_LIMIT)return false;
  const ids=new Set();
  for(const g of genres){
    if(!g||typeof g.id!=="string"||!g.id||g.id.length>200||ids.has(g.id))return false;
    ids.add(g.id);
    if(typeof g.name!=="string"||g.name!==cleanGenreName(g.name)||!genreKey(g.name)||[...g.name].length>GENRE_NAME_MAX)return false;
  }
  return true;
}
function validData(value) {
  if(!value||value.version!==3||!validGenres(value.genres)||!Array.isArray(value.records)||value.records.length>10000) return false;
  const genreIds=new Set(value.genres.map(g=>g.id));
  const ids=new Set();
  for(const r of value.records){
    if(!r||typeof r.id!=="string"||!r.id||r.id.length>200||ids.has(r.id))return false;
    ids.add(r.id);
    if(!genreIds.has(r.subject)||typeof r.title!=="string"||!r.title.trim()||r.title.length>200)return false;
    if(typeof r.content!=="string"||r.content.length>40000||typeof r.q!=="string"||r.q.length>4000||typeof r.a!=="string"||r.a.length>8000)return false;
    if(!isDate(r.studied)||!isDate(r.review)||r.review<addDays(r.studied,1))return false;
    if(!["pending","done"].includes(r.status)||!Number.isInteger(r.postponed)||r.postponed<0)return false;
    if(r.status==="done" ? !isDate(r.doneAt)||r.doneAt<r.studied : r.doneAt!==null)return false;
  }
  if(!value.activity||typeof value.activity!=="object"||Array.isArray(value.activity))return false;
  return Object.entries(value.activity).every(([day,items])=>isDate(day)&&items&&typeof items==="object"&&!Array.isArray(items)
    &&Object.entries(items).every(([id,state])=>ids.has(id)&&["done","postponed"].includes(state)));
}
function unknownGenreName(genres) {
  const keys=new Set(genres.map(g=>g&&typeof g.name==="string" ? genreKey(g.name) : ""));
  for(let n=1;;n++){
    const name=n===1 ? "不明なジャンル" : "不明なジャンル "+n;
    if(!keys.has(genreKey(name)))return name;
  }
}
// 読み込んだ値を現在の形式（version 3）へそろえる。渡された値そのものは書き換えない。
// version 1：科目が4つに固定されていた旧形式。ジャンル一覧がないので、記録で使われている科目だけをジャンルにする。
// version 2：4科目を最初から入れていた形式。記録で使われていない4科目は一覧から外す（自分で追加したジャンルは残す）。
// version 3：ジャンルは空から始まり、利用者が追加したものだけを持つ。
// どの形式でも、記録の subject（java / eng / math / hist など）は書き換えない。
// 正しくない値のときは例外を投げる。呼び出し側は、そのとき保存内容を上書きしない。
function upgradeData(saved) {
  if(!saved||typeof saved!=="object"||Array.isArray(saved))throw new Error("形式が違います");
  if(![1,2,3].includes(saved.version))throw new Error(Number.isInteger(saved.version)&&saved.version>3 ? "このアプリより新しい形式のデータです" : "形式が違います");
  if(!Array.isArray(saved.records)||(saved.version!==1&&!Array.isArray(saved.genres)))throw new Error("形式が違います");
  const value=structuredClone({version:3,genres:saved.version===1 ? [] : saved.genres,records:saved.records,activity:saved.activity});
  const used=new Set(value.records.map(r=>r&&r.subject));
  const isLegacy=id=>LEGACY_GENRES.some(g=>g.id===id);
  if(saved.version===1)value.genres=LEGACY_GENRES.filter(g=>used.has(g.id)).map(g=>({...g}));
  if(saved.version===2)value.genres=value.genres.filter(g=>!g||!isLegacy(g.id)||used.has(g.id));
  value.genres.forEach(g=>{if(g&&typeof g.name==="string")g.name=cleanGenreName(g.name)});
  // 一覧にないジャンルidを持つ記録があっても表示できるよう、仮のジャンルを補う。
  const ids=new Set(value.genres.map(g=>g&&g.id));
  for(const r of value.records){
    if(!r||typeof r.subject!=="string"||!r.subject||r.subject.length>200||ids.has(r.subject))continue;
    const base=LEGACY_GENRES.find(g=>g.id===r.subject);
    const free=base&&!value.genres.some(g=>g&&typeof g.name==="string"&&genreKey(g.name)===genreKey(base.name));
    ids.add(r.subject);value.genres.push({id:r.subject,name:free ? base.name : unknownGenreName(value.genres)});
  }
  if(!validData(value))throw new Error("形式が違います");
  return value;
}
function loadData() {
  legacyText="";
  try {
    originalText=localStorage.getItem(DATA_KEY)||"";
    if(!originalText)return emptyData();
    const saved=JSON.parse(originalText);
    const value=upgradeData(saved);
    // 古い形式はここでは書き換えない。次に保存するときに現在の形式で保存する。
    // 科目固定の旧形式（version 1）だけは、その直前に元の内容の控えを残す。
    if(saved.version===1)legacyText=originalText;
    return value;
  }catch(error){
    storageBlocked=true;
    notice("保存記録を読めません。上書きは停止しました。書き出して保管し、正しいバックアップを読み込んでください。",true);
    return emptyData();
  }
}
// 実際に書き込む。失敗したら例外を投げ、data も保存内容も変えない。
function writeStorage(next) {
  if(!validData(next))throw new Error("記録の形式または件数が不正です");
  const text=JSON.stringify(next);
  let keptLegacy=false;
  if(legacyText){try{localStorage.setItem(LEGACY_KEY,legacyText);keptLegacy=true}catch(error){}}
  try{localStorage.setItem(DATA_KEY,text)}
  catch(error){
    // 控えの分だけ容量が足りない場合に備え、控えをやめてもう一度だけ試す。
    if(!keptLegacy)throw new Error("ブラウザに保存できません");
    try{localStorage.removeItem(LEGACY_KEY);localStorage.setItem(DATA_KEY,text)}
    catch(again){throw new Error("ブラウザに保存できません")}
  }
  if(localStorage.getItem(DATA_KEY)!==text)throw new Error("保存した内容を確認できません");
  legacyText="";originalText=text;data=next;
}
function commit(next) {
  if(storageBlocked){notice("上書き停止中です。正しいバックアップを読み込んでください。",true);return false}
  try {
    writeStorage(next);
    $("storage-status").textContent="このブラウザに保存しました。";return true;
  }catch(error){
    $("storage-status").textContent="直前の変更は保存できていません。";
    notice("保存できません。変更は反映していません。書き出しや保存設定を確認してください。",true);return false;
  }
}
function download(text,name) {
  const url=URL.createObjectURL(new Blob([text],{type:"application/json"}));
  const a=document.createElement("a");a.href=url;a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function wireStorage() {
  $("export-data").onclick=()=>download(storageBlocked&&originalText ? originalText : JSON.stringify(data,null,2),"ヨクジツ-記録.json");
  $("import-data").onclick=()=>$("import-file").click();
  $("import-file").onchange=async()=>{
    const file=$("import-file").files[0];if(!file)return;
    try {
      if(file.size>5000000)throw new Error("ファイルが大きすぎます");
      let saved;
      try{saved=JSON.parse(await file.text())}catch(error){throw new Error("JSONとして読めません")}
      // ジャンルのない旧形式のバックアップも、ここで現在の形式にそろえてから確かめる。
      const next=upgradeData(saved);
      if(!confirm(`現在の記録とジャンルを、バックアップの内容（記録${next.records.length}件・ジャンル${next.genres.length}個）に置き換えますか？`))return;
      writeStorage(next);
      storageBlocked=false;currentIndex=0;answerVisible=false;filter=ALL;historyFilter=ALL;lastGenre="";
      resetForm();switchView("review");
      $("storage-status").textContent="このブラウザに保存しました。";
      notice(`バックアップを読み込みました（記録${next.records.length}件・ジャンル${next.genres.length}個）。`);
    }catch(error){notice("読込失敗："+error.message+"。現在の記録は置き換えていません。",true)}
    finally{$("import-file").value=""}
  };
  // 別のタブで保存されたら、古い内容で上書きしないよう読み直す。
  window.addEventListener("storage",event=>{
    if(event.storageArea!==localStorage||(event.key!==null&&event.key!==DATA_KEY))return;
    if((localStorage.getItem(DATA_KEY)||"")===originalText)return;
    storageBlocked=false;data=loadData();
    if(!storageBlocked)notice("別のタブでの変更を読み込みました。");
    render();if($("genre-dialog").open)renderPicker();
  });
}
let data=loadData();
// 表示用の状態。記録そのものと区別する。
let filter = ALL;          // 今日の復習の絞り込み（ジャンルのid、または ALL）
let historyFilter = ALL;   // 学習履歴の絞り込み（同上）
let formGenre = "";        // 記録フォームで選択中のジャンルのid
let lastGenre = "";        // 直前に記録したジャンル。次の記録の初期値にする
let currentIndex = 0;
let answerVisible = false;
let currentView = "review";
let editingId = null;
let detailId = null;
function dueRecords() {
  return data.records.filter(r => r.status === "pending" && r.review <= today
    && (filter === ALL || r.subject === filter))
    .sort((a,b) => a.review.localeCompare(b.review));
}
function switchView(view) {
  currentView = view;
  ["review","record","history","complete"].forEach(name => {
    const screen = $(name + "-screen");
    if (screen) screen.hidden = name !== view;
  });
  document.querySelectorAll(".rail [data-view]").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  render();
}
// 選択中のジャンルが一覧から消えていたら（バックアップの読み込み後など）、安全な値へ戻す。
function fixSelections() {
  if(filter!==ALL&&!hasGenre(filter)){filter=ALL;currentIndex=0;answerVisible=false}
  if(historyFilter!==ALL&&!hasGenre(historyFilter))historyFilter=ALL;
  if(!hasGenre(formGenre))formGenre=data.genres.length ? data.genres[0].id : "";
}
function renderGenreButtons() {
  $("review-genre-value").textContent=filter===ALL ? "すべて" : genreName(filter);
  $("history-genre-value").textContent=historyFilter===ALL ? "すべて" : genreName(historyFilter);
  $("form-genre-value").textContent=formGenre ? genreName(formGenre) : "未選択";
  $("delete-genre").disabled=!data.genres.length;
  $("rename-genre").disabled=!data.genres.length;
}
function render() {
  fixSelections();
  renderGenreButtons();
  $("today-label").textContent = today.replace("-","年").replace("-","月") + "日";
  $("remaining").textContent = " " + data.records.filter(r=>r.status === "pending" && r.review <= today).length;
  const visible = dueRecords();
  currentIndex = Math.max(0, Math.min(currentIndex, visible.length-1));
  $("review-card").hidden = !visible.length;
  $("empty").hidden = !!visible.length;
  $("empty-title").textContent = filter === ALL ? "今日の復習はありません。" : `「${genreName(filter)}」の復習はありません。`;
  if (visible.length) {
    const r = visible[currentIndex];
    $("card-genre").textContent = genreName(r.subject);
    $("review-title").textContent = r.title;
    $("question").textContent = r.q || "学んだことを、自分の言葉で思い出してみよう。";
    $("content").textContent = r.content;
    $("position").textContent = `${String(currentIndex+1).padStart(2,"0")} / ${String(visible.length).padStart(2,"0")}`;
    $("page-number").textContent = `${currentIndex+1} / ${visible.length}`;
    $("studied-label").textContent = r.review < today ? "期限切れ" : "今日の復習";
    $("reveal").hidden = !r.q;
    $("answer").hidden = !answerVisible || !r.q;
    $("answer").textContent = r.a || "（答えは未入力です）";
    $("reveal").textContent = answerVisible ? "答えを隠す" : "◎ タップして答えを見る";
    $("reveal").setAttribute("aria-expanded",String(answerVisible));
    $("prev").disabled = currentIndex === 0;
    $("next").disabled = currentIndex === visible.length-1;
  }
  renderMore(visible);
}
function wireReview() {
  $("reveal").onclick=()=>{answerVisible=!answerVisible;render()};
  $("prev").onclick=()=>{currentIndex--;answerVisible=false;render()};
  $("next").onclick=()=>{currentIndex++;answerVisible=false;render()};
  document.querySelectorAll("[data-view]").forEach(b=>b.onclick=()=>{
    if (b.dataset.view === "record") resetForm();
    switchView(b.dataset.view);
   });
}
// ジャンルを選ぶダイアログ。記録フォーム・今日の復習・学習履歴の3か所で共用する。
// 検索欄に文字を入れても一覧を絞り込むだけ。候補を押したときにだけ選択が変わる。
let picker=null;
function openGenrePicker(options) {
  picker=options;
  $("genre-dialog-title").textContent=options.heading;
  $("genre-search").value="";$("genre-error").textContent="";
  renderPicker();
  $("genre-dialog").showModal();
  // スマホでは、開いた瞬間にキーボードが出て一覧を隠さないよう、検索欄へは自動で移らない。
  (matchMedia("(pointer:coarse)").matches ? $("genre-dialog-title") : $("genre-search")).focus();
  const current=$("genre-options").querySelector('[aria-current="true"]');
  if(current)current.scrollIntoView({block:"nearest"});
}
function renderPicker() {
  if(!picker)return;
  const typed=cleanGenreName($("genre-search").value), key=searchKey(typed);
  const matches=data.genres.filter(g=>searchKey(g.name).includes(key));
  const counts=picker.counts ? picker.counts() : null;
  const list=$("genre-options");list.replaceChildren();
  const addOption=(id,name,count)=>{
    const item=document.createElement("li"),button=document.createElement("button"),label=document.createElement("span"),note=document.createElement("small");
    button.type="button";button.className="genre-option";
    label.className="name";label.textContent=name;
    const selected=id===picker.selected;
    if(selected)button.setAttribute("aria-current","true");
    note.textContent=[count===null ? "" : count+"件",selected ? "選択中" : ""].filter(Boolean).join("・");
    button.append(label,note);button.onclick=()=>chooseGenre(id);
    item.append(button);list.append(item);
  };
  if(picker.allowAll)addOption(ALL,"すべて",counts ? [...counts.values()].reduce((sum,n)=>sum+n,0) : null);
  matches.forEach(g=>addOption(g.id,g.name,counts ? counts.get(g.id)||0 : null));
  // 画面が低いときも、候補が少なくとも2行は見えるようにする（1行は48px以上）。
  list.style.minHeight=Math.min(list.children.length,2)*48+"px";
  const exact=data.genres.some(g=>genreKey(g.name)===genreKey(typed));
  const canCreate=picker.allowCreate&&!(key&&exact);
  $("genre-count").textContent=!data.genres.length&&!key ? "ジャンルはまだありません。"+(canCreate ? "下のボタンから追加してください。" : "記録の画面で追加できます。")
    : !key ? `ジャンルは全部で${data.genres.length}個あります。`
    : matches.length ? `「${typed}」を含むジャンル：${matches.length}個`
    : `「${typed}」を含むジャンルはありません。`+(canCreate ? "下のボタンから追加できます。" : "");
  $("genre-create").hidden=!canCreate;
  $("genre-create").textContent=key ? `＋「${typed}」を新しいジャンルとして追加` : "＋ 新しいジャンルを追加";
}
function chooseGenre(id) {
  const current=picker;if(!current)return;
  $("genre-dialog").close();
  current.onSelect(id);
}
// 名前を入力するダイアログ。ジャンルの追加と、名前の変更の両方で使う。
let genreAdd=null;
function setGenreAddError(text) {
  $("genre-add-error").textContent=text;
  if(text)$("genre-name").setAttribute("aria-invalid","true");else $("genre-name").removeAttribute("aria-invalid");
}
function openGenreAdd(opener,onAdded) {
  genreAdd={opener,onAdded};
  $("genre-add-title").textContent="ジャンルを追加";$("genre-add-submit").textContent="追加する";
  $("genre-name").value="";setGenreAddError("");
  $("genre-add-dialog").showModal();
  $("genre-name").focus();
}
function openGenreRename(id,opener) {
  const genre=data.genres.find(g=>g.id===id);if(!genre)return;
  genreAdd={opener,renameId:id};
  $("genre-add-title").textContent=`「${genre.name}」の名前を変更`;$("genre-add-submit").textContent="変更する";
  $("genre-name").value=genre.name;setGenreAddError("");
  $("genre-add-dialog").showModal();
  // 今の名前を入れて全体を選んだ状態にする。一部だけ直すことも、打ち直すこともできる。
  $("genre-name").focus();$("genre-name").select();
}
// ジャンルを削除する。そのジャンルの記録は mode に従って扱う。
// "move"：記録を dest のジャンルへ移す ／ "remove"：記録もいっしょに削除する ／ それ以外：記録が残っていれば削除しない。
// 保存に成功したときだけ、画面の状態を更新する。
function deleteGenre(id,mode,dest) {
  const next=structuredClone(data);
  const targets=next.records.filter(r=>r.subject===id);
  if(targets.length&&mode==="move"){
    if(dest===id||!next.genres.some(g=>g.id===dest))return {ok:false,error:"移し先のジャンルを選んでください。"};
    targets.forEach(r=>{r.subject=dest});
  }else if(targets.length&&mode==="remove"){
    const gone=new Set(targets.map(r=>r.id));
    next.records=next.records.filter(r=>!gone.has(r.id));
    Object.values(next.activity).forEach(day=>gone.forEach(recordId=>delete day[recordId]));
  }else if(targets.length)return {ok:false,error:"記録をどうするか選んでください。"};
  next.genres=next.genres.filter(g=>g.id!==id);
  if(!commit(next))return {ok:false,error:"保存できなかったため、削除していません。"};
  const moved=mode==="move"&&targets.length ? dest : "";
  if(formGenre===id)formGenre=moved;
  if(lastGenre===id)lastGenre=moved;
  if(editingId&&!data.records.some(r=>r.id===editingId))resetForm();
  currentIndex=0;answerVisible=false;render();
  return {ok:true,count:targets.length};
}
// 削除の前に確かめるダイアログ。記録があるジャンルでは、記録の扱いを選んでもらう。
let genreDelete=null;
function syncGenreDeleteMode() {
  $("genre-delete-dest-field").hidden=!$("genre-delete-move").checked;
}
function openGenreDelete(id,opener) {
  const genre=data.genres.find(g=>g.id===id);if(!genre)return;
  const count=data.records.filter(r=>r.subject===id).length, others=data.genres.filter(g=>g.id!==id);
  genreDelete={id,opener};
  $("genre-delete-title").textContent=`「${genre.name}」を削除`;
  $("genre-delete-text").textContent=count ? `このジャンルの記録が${count}件あります。記録をどうするか選んでください。` : "このジャンルの記録はありません。削除してよいですか？";
  $("genre-delete-options").hidden=!count;
  const dest=$("genre-delete-dest");dest.replaceChildren();
  others.forEach(g=>{const option=document.createElement("option");option.value=g.id;option.textContent=g.name;dest.append(option)});
  $("genre-delete-move").disabled=!others.length;
  $("genre-delete-move").checked=!!others.length;
  $("genre-delete-remove").checked=false;
  $("genre-delete-move-note").hidden=!!others.length;
  $("genre-delete-error").textContent="";
  syncGenreDeleteMode();
  $("genre-delete-dialog").showModal();
  // まちがってEnterを押しても消えないよう、最初は「やめる」に合わせる。
  $("cancel-genre-delete").focus();
}
function recordsByGenre(test) {
  const counts=new Map();
  data.records.forEach(r=>{if(test(r))counts.set(r.subject,(counts.get(r.subject)||0)+1)});
  return counts;
}
function wireGenres() {
  $("review-genre").onclick=()=>openGenrePicker({heading:"復習のジャンルを選ぶ",selected:filter,allowAll:true,allowCreate:false,opener:$("review-genre"),
    counts:()=>recordsByGenre(r=>r.status==="pending"&&r.review<=today),
    onSelect:id=>{filter=id;currentIndex=0;answerVisible=false;render()}});
  $("history-genre").onclick=()=>openGenrePicker({heading:"履歴のジャンルを選ぶ",selected:historyFilter,allowAll:true,allowCreate:false,opener:$("history-genre"),
    counts:()=>recordsByGenre(()=>true),
    onSelect:id=>{historyFilter=id;render()}});
  const selectInForm=id=>{formGenre=id;$("form-error").textContent="";renderGenreButtons()};
  $("form-genre").onclick=()=>openGenrePicker({heading:"記録のジャンルを選ぶ",selected:formGenre,allowAll:false,allowCreate:true,opener:$("form-genre"),onSelect:selectInForm});
  $("add-genre").onclick=()=>openGenreAdd($("form-genre"),selectInForm);
  // 名前の変更：検索付きの一覧からジャンルを選び、次の画面で新しい名前を入れる。
  $("rename-genre").onclick=()=>openGenrePicker({heading:"名前を変えるジャンルを選ぶ",selected:null,allowAll:false,allowCreate:false,opener:$("rename-genre"),
    counts:()=>recordsByGenre(()=>true),
    onSelect:id=>openGenreRename(id,$("rename-genre"))});
  // 削除：まず検索付きの一覧から消したいジャンルを選び、次の画面で確かめてから消す。
  $("delete-genre").onclick=()=>openGenrePicker({heading:"削除するジャンルを選ぶ",selected:null,allowAll:false,allowCreate:false,opener:$("delete-genre"),
    counts:()=>recordsByGenre(()=>true),
    onSelect:id=>openGenreDelete(id,$("delete-genre"))});
  $("genre-search").oninput=()=>{$("genre-error").textContent="";renderPicker()};
  $("close-genre").onclick=()=>$("genre-dialog").close();
  $("genre-create").onclick=()=>{
    const current=picker;if(!current)return;
    const typed=cleanGenreName($("genre-search").value);
    if(!genreKey(typed)){$("genre-dialog").close();openGenreAdd(current.opener,current.onSelect);return}
    const result=addGenre(typed);
    if(!result.ok){$("genre-error").textContent=result.error;return}
    chooseGenre(result.genre.id);notice(`ジャンル「${result.genre.name}」を追加しました。`);
  };
  // キーボード操作：検索欄で↓かEnterを押すと候補へ移り、↑↓で候補を移動する。
  $("genre-dialog").addEventListener("keydown",event=>{
    if(event.isComposing||event.keyCode===229)return; // 日本語の変換を確定するEnterでは動かさない
    const options=[...$("genre-options").querySelectorAll("button")];
    const index=options.indexOf(document.activeElement), inSearch=event.target===$("genre-search");
    if((event.key==="ArrowDown"&&(inSearch||index>=0))||(event.key==="Enter"&&inSearch)){
      const target=options[index+1]||(inSearch&&!$("genre-create").hidden ? $("genre-create") : null);
      event.preventDefault();if(target)target.focus();
    }else if(event.key==="ArrowUp"&&index>=0){
      event.preventDefault();(options[index-1]||$("genre-search")).focus();
    }
  });
  // ダイアログの外側（暗い部分）を押したら、何も変えずに閉じる。
  $("genre-dialog").addEventListener("click",event=>{
    if(event.target!==$("genre-dialog"))return;
    const box=$("genre-dialog").getBoundingClientRect();
    if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)$("genre-dialog").close();
  });
  // 閉じたら、開く前に押したボタンへ戻る。
  $("genre-dialog").addEventListener("close",()=>{
    if($("genre-dialog").open)return;
    const opener=picker&&picker.opener;picker=null;
    if(opener&&!document.querySelector("dialog[open]"))opener.focus();
  });
  // スマホのキーボードで隠れない高さをCSSへ伝える（styles.css の --visible-height）。
  if(window.visualViewport){
    // 画面が隠れているときなど高さを正しく取れない場合は、指定を外してCSS側の既定値に任せる。
    const setVisibleHeight=()=>{
      if(visualViewport.height>=200)document.documentElement.style.setProperty("--visible-height",visualViewport.height+"px");
      else document.documentElement.style.removeProperty("--visible-height");
    };
    visualViewport.addEventListener("resize",setVisibleHeight);setVisibleHeight();
  }
  $("genre-name").oninput=()=>setGenreAddError("");
  $("cancel-genre-add").onclick=()=>$("genre-add-dialog").close();
  $("genre-add-form").onsubmit=event=>{
    event.preventDefault();
    const current=genreAdd;
    if(current&&current.renameId){
      const renamed=renameGenre(current.renameId,$("genre-name").value);
      if(!renamed.ok){setGenreAddError(renamed.error);$("genre-name").focus();return}
      $("genre-add-dialog").close();
      if(!renamed.changed)return;
      render();
      notice(`ジャンル「${renamed.oldName}」を「${renamed.genre.name}」に変更しました。`);
      return;
    }
    const result=addGenre($("genre-name").value);
    if(!result.ok){setGenreAddError(result.error);$("genre-name").focus();return}
    if(current)current.onAdded(result.genre.id);
    $("genre-add-dialog").close();
    notice(`ジャンル「${result.genre.name}」を追加しました。`);
  };
  $("genre-add-dialog").addEventListener("close",()=>{
    if($("genre-add-dialog").open)return;
    const opener=genreAdd&&genreAdd.opener;genreAdd=null;
    if(opener&&!document.querySelector("dialog[open]"))opener.focus();
  });
  $("genre-delete-move").onchange=syncGenreDeleteMode;
  $("genre-delete-remove").onchange=syncGenreDeleteMode;
  $("cancel-genre-delete").onclick=()=>$("genre-delete-dialog").close();
  $("genre-delete-form").onsubmit=event=>{
    event.preventDefault();
    const current=genreDelete;if(!current)return;
    const genre=data.genres.find(g=>g.id===current.id);
    if(!genre){$("genre-delete-dialog").close();return}
    const count=data.records.filter(r=>r.subject===current.id).length;
    let mode="",dest="";
    if(count&&$("genre-delete-move").checked){mode="move";dest=$("genre-delete-dest").value}
    else if(count&&$("genre-delete-remove").checked){
      mode="remove";
      if(!confirm(`「${genre.name}」と、その記録${count}件を削除します。元に戻せません。よろしいですか？`))return;
    }
    const destName=mode==="move" ? genreName(dest) : "";
    const result=deleteGenre(current.id,mode,dest);
    if(!result.ok){$("genre-delete-error").textContent=result.error;return}
    $("genre-delete-dialog").close();
    notice(!result.count ? `ジャンル「${genre.name}」を削除しました。`
      : mode==="move" ? `ジャンル「${genre.name}」を削除し、記録${result.count}件を「${destName}」へ移しました。`
      : `ジャンル「${genre.name}」と記録${result.count}件を削除しました。`);
  };
  $("genre-delete-dialog").addEventListener("close",()=>{
    if($("genre-delete-dialog").open)return;
    const opener=genreDelete&&genreDelete.opener;genreDelete=null;
    // 最後の1つを消すと削除ボタンは押せなくなるので、そのときは追加ボタンへ戻る。
    const target=opener&&opener.disabled ? $("add-genre") : opener;
    if(target&&!document.querySelector("dialog[open]"))target.focus();
  });
}
// 入力担当。JavaのinputRecordに相当する。
function updateReviewDate() {
  $("review-date").value = isDate($("studied").value) ? addDays($("studied").value,1) : "";
}
function resetForm() {
  editingId=null;
  $("record-form").reset();
  formGenre=hasGenre(lastGenre) ? lastGenre : (data.genres.length ? data.genres[0].id : "");
  renderGenreButtons();
  $("form-heading").textContent="学習を記録";
  $("submit-record").textContent="記録する →";
  $("cancel-edit").hidden=true;
  $("quiz-fields").open=false;
  $("studied").value=today;
  $("studied").max=today;
  $("form-error").textContent="";
  updateReviewDate();
}
function wireForm() {
  resetForm();
  $("studied").oninput=updateReviewDate;
  $("cancel-edit").onclick=()=>{resetForm();switchView("review")};
  $("record-form").onsubmit=event=>{
    event.preventDefault();
    const studied=$("studied").value, title=$("title").value.trim();
    if (!hasGenre(formGenre)) {
      $("form-error").textContent=data.genres.length ? "ジャンルを選んでください。" : "先に「＋ ジャンルを追加」からジャンルを作ってください。"; return;
    }
    if (!title || !isDate(studied) || studied > today) {
      $("form-error").textContent="タイトルと、今日以前の正しい学習日を入力してください。"; return;
    }
    const old=data.records.find(r=>r.id===editingId);
    if (old && old.doneAt && studied > old.doneAt) {
      $("form-error").textContent="完了日より後の学習日には変更できません。"; return;
    }
    const r={id:old ? old.id : newId(),subject:formGenre,title,
      content:$("learned").value,studied,
      review:old && old.studied===studied ? old.review : addDays(studied,1),
      status:old ? old.status : "pending",doneAt:old ? old.doneAt : null,
      q:$("quiz-question").value,a:$("quiz-answer").value,postponed:old ? old.postponed : 0};
    const next=structuredClone(data);
    if (old) next.records[next.records.findIndex(x=>x.id===old.id)]=r;
    else next.records.push(r);
    if (!commit(next)) return;
    lastGenre=r.subject;
    $("recorded-date").textContent="復習予定日：" + r.review;
    $("complete-screen").querySelector("h2").textContent=old ? "変更しました" : "記録しました";
    editingId=null; answerVisible=false;
    switchView("complete");notice(old ? "記録を更新しました。" : "明日の復習へつなげました。");
  };
}
// 状態変更。Javaのcomplete・postpone・historyに相当する。
function finishReview(done) {
  const r=dueRecords()[currentIndex]; if (!r) return;
  const next=structuredClone(data), target=next.records.find(x=>x.id===r.id);
  if (done) {target.status="done";target.doneAt=today}
  else {target.review=addDays(today,1);target.postponed++}
  next.activity[today] ||= {};
  next.activity[today][r.id]=done ? "done" : "postponed";
  if (!commit(next)) return;
  answerVisible=false;render();
  notice(done ? "完了しました。" : "明日もう一度出します："+target.review);
}
function statusText(r) {
  if (r.status==="done") return "完了 ✓";
  if (r.review < today) return "期限切れ";
  return r.review===today ? "今日復習" : r.review+"に復習";
}
function streakCount() {
  const days=new Set(data.records.filter(r=>r.status==="done").map(r=>r.doneAt));
  let day=days.has(today) ? today : addDays(today,-1), count=0;
  while(days.has(day)){count++;day=addDays(day,-1)}
  return count;
}
function renderMore(visible) {
  $("done").disabled=!visible.length;
  $("streak").textContent=streakCount()+"日連続";
  const tomorrow=data.records.filter(r=>r.status==="pending" && r.review===addDays(today,1)).length;
  $("empty-message").textContent=`今日の残りは全ジャンルで${data.records.filter(r=>r.status==="pending" && r.review<=today).length}件。明日の復習は${tomorrow}件です。`;
  const session=[...data.records.filter(r=>r.status==="pending"&&r.review<=today).map(r=>[r.id,"pending"]),...Object.entries(data.activity[today]||{})];
  $("progress").replaceChildren();
  session.forEach(([,state])=>{
    const cell=document.createElement("span");cell.className=state;
    cell.title={done:"完了",postponed:"翌日送り",pending:"未着手"}[state];
    cell.setAttribute("aria-label",cell.title);$("progress").append(cell);
  });
  $("queue").replaceChildren();
  if (visible.length>1) {
    const label=document.createElement("p");label.textContent="このあと（押すと移動）";$("queue").append(label);
    visible.forEach((r,i)=>{if(i===currentIndex)return;
      const b=document.createElement("button");b.className="queue";b.textContent=genreName(r.subject)+" ｜ "+r.title;
      b.onclick=()=>{currentIndex=i;answerVisible=false;render()};$("queue").append(b);
    });
  }
  const completed=data.records.filter(r=>r.status==="done"&&r.doneAt===today);
  if(completed.length){const p=document.createElement("p");p.className="small";p.textContent="済んだもの："+completed.map(r=>r.title).join(" ／ ");$("queue").append(p)}
  renderHistory();
}
function renderHistory() {
  const list=data.records.filter(r=>historyFilter===ALL||r.subject===historyFilter).sort((a,b)=>b.studied.localeCompare(a.studied));
  $("history-list").replaceChildren();let day="";
  if(!list.length) $("history-list").textContent=historyFilter===ALL ? "記録はまだありません。" : `「${genreName(historyFilter)}」の記録はまだありません。`;
  list.forEach(r=>{
    if(day!==r.studied){day=r.studied;const h=document.createElement("h2");h.className="history-day";h.textContent=day;$("history-list").append(h)}
    // 利用者が入力した文字は textContent で入れる（HTMLとして解釈させない）。
    const b=document.createElement("button"),badge=document.createElement("span"),title=document.createElement("span"),state=document.createElement("small");
    b.className="history-item";badge.className="badge";badge.textContent=genreName(r.subject);
    title.className="history-title";title.textContent=r.title;state.textContent=statusText(r);
    b.append(badge,title,state);
    b.onclick=()=>openDetail(r.id);$("history-list").append(b);
  });
}
function openDetail(id) {
  const r=data.records.find(x=>x.id===id);if(!r)return;detailId=id;
  $("detail-title").textContent=r.title;
  $("detail-body").textContent=`ジャンル：${genreName(r.subject)}
学習日：${r.studied}
復習日：${r.review}
状態：${statusText(r)}
完了日：${r.doneAt||"未完了"}
まだ不安：${r.postponed}回

学んだこと
${r.content}

質問
${r.q||"なし"}

答え
${r.a||"なし"}`;
  $("detail-dialog").showModal();
}
function wireActions() {
  $("done").onclick=()=>finishReview(true);
  $("postpone").onclick=()=>finishReview(false);
  $("close-detail").onclick=()=>$("detail-dialog").close();
  $("edit-record").onclick=()=>{
    const r=data.records.find(x=>x.id===detailId);if(!r)return;
    resetForm();editingId=r.id;
    formGenre=r.subject;renderGenreButtons();
    $("title").value=r.title;$("learned").value=r.content;
    $("studied").value=r.studied;$("review-date").value=r.review;
    $("quiz-question").value=r.q;$("quiz-answer").value=r.a;
    $("quiz-fields").open=!!r.q;$("form-heading").textContent="学習記録を編集";
    $("submit-record").textContent="変更を保存";$("cancel-edit").hidden=false;
    $("detail-dialog").close();switchView("record");
  };
  $("delete-record").onclick=()=>{
    const r=data.records.find(x=>x.id===detailId);if(!r||!confirm(`「${r.title}」を削除しますか？`))return;
    const next=structuredClone(data);next.records=next.records.filter(x=>x.id!==r.id);
    Object.values(next.activity).forEach(day=>delete day[r.id]);
    if(!commit(next))return;
    $("detail-dialog").close();answerVisible=false;render();notice("削除しました。");
  };
}
$("app-version").textContent="アプリの版："+APP_VERSION;
wireReview();
wireGenres();
wireForm();
wireActions();
wireStorage();
render();
// 日付が変わったら、対象とフォームの初期日を更新する。
function checkDay() {
  const now=localDay();if(now===today)return;
  today=now;currentIndex=0;answerVisible=false;
  if(currentView!=="record")resetForm();
  render();
}
window.addEventListener("focus",checkDay);
setInterval(checkDay,60000);
// スマホで二本指の拡大縮小を止める。基本は styles.css の touch-action で止まるが、
// それが効かないブラウザのために、二本指で動かしたときの既定の動作も止めておく。
document.addEventListener("touchmove",event=>{if(event.touches.length>1)event.preventDefault()},{passive:false});
document.addEventListener("gesturestart",event=>event.preventDefault());
// アプリ本体のオフライン用コピーを用意する。記録の保存とは別。
async function setupPWA() {
  if(!("serviceWorker" in navigator)) {
    $("offline-status").textContent="このブラウザではオフライン機能を利用できません。";return;
  }
  try {
    // 新しい版のコピーに切り替わったら知らせる。入力中かもしれないので、勝手には再読み込みしない。
    const hadController=!!navigator.serviceWorker.controller;
    $("reload-app").onclick=()=>location.reload();
    navigator.serviceWorker.addEventListener("controllerchange",()=>{
      if(!hadController)return;
      $("offline-status").textContent="アプリの新しい版を用意しました。再読み込みすると切り替わります。";
      $("reload-app").hidden=false;
    });
    await navigator.serviceWorker.register("./sw.js");
    await navigator.serviceWorker.ready;
    if($("reload-app").hidden)$("offline-status").textContent="オフラインの準備ができました。初回は一度再読み込みしてください。";
  }catch(error){$("offline-status").textContent="オフライン準備に失敗しました。localhostまたはHTTPSで開き、接続を確認してください。"}
}
setupPWA();
