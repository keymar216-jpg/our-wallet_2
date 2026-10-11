import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, setDoc, updateDoc, addDoc, deleteDoc, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
const CATEGORIES = ["食費","カフェ","交通費","宿泊費","買い物","デート・レジャー","日用品","その他"];
const ICONS = {"食費":"🍽","カフェ":"☕","交通費":"🚗","宿泊費":"🛏","買い物":"🛍","デート・レジャー":"🎡","日用品":"🧻","その他":"✦"};
const money = (n) => "¥" + Number(n || 0).toLocaleString("ja-JP");
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const monthKey = (date) => date.slice(0,7);
const safeText = (value) => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const isConfigured = () => firebaseConfig.apiKey !== "YOUR_API_KEY" && firebaseConfig.projectId !== "YOUR_PROJECT_ID";

let auth, db, currentUser = null, roomId = null, roomData = null, expenses = [], monthOffset = 0, selectedDate = todayISO();
let stopRoomListener = null, stopExpenseListener = null, toastTimer = null;
const toast = (message) => { const el=$("toast"); el.textContent=message; el.classList.add("show"); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove("show"),2600); };
const setConnected = (connected) => {
  $("connectionStatus").textContent = connected ? "共有中" : "未接続";
  $("connectionStatus").classList.toggle("connected", connected);
  $("roomInfo").classList.toggle("hidden", !connected);
  $("mainContent").classList.toggle("hidden", !connected);
  $("addExpenseFab").classList.toggle("hidden", !connected);
  $("bottomNav").classList.toggle("hidden", !connected);
};
const currentMonthDate = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth()+monthOffset); return d; };
const currentMonthKey = () => { const d=currentMonthDate(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; };
const monthExpenses = () => expenses.filter(e => monthKey(e.date) === currentMonthKey());
const total = (items) => items.reduce((sum,e)=>sum+Number(e.amount||0),0);
const prettyMonth = () => { const d=currentMonthDate(); return `${d.getFullYear()}年${d.getMonth()+1}月`; };

function render() {
  $("monthLabel").textContent = prettyMonth();
  const monthItems = monthExpenses();
  const monthTotal = total(monthItems);
  $("monthTotal").textContent = monthTotal.toLocaleString("ja-JP");
  const todayTotal = total(expenses.filter(e=>e.date===todayISO()));
  $("todayTotal").textContent = money(todayTotal);
  const daysInMonth = new Date(currentMonthDate().getFullYear(),currentMonthDate().getMonth()+1,0).getDate();
  const passedDays = currentMonthKey()===todayISO().slice(0,7) ? new Date().getDate() : daysInMonth;
  $("dailyAverage").textContent = money(passedDays ? Math.round(monthTotal/passedDays) : 0);
  const budget = Number(roomData?.monthlyBudget || 0);
  $("budgetText").textContent = budget > 0 ? `${money(monthTotal)} / ${money(budget)}` : "未設定";
  $("budgetProgress").style.width = budget > 0 ? `${Math.min(100,monthTotal/budget*100)}%` : "0%";
  $("budgetProgress").style.background = budget>0 && monthTotal>budget ? "var(--red)" : "";
  renderCalendar();
  renderDailyList();
  renderCategoryChart(monthItems);
}

function renderCalendar() {
  const d=currentMonthDate(), year=d.getFullYear(), month=d.getMonth();
  const firstDay=new Date(year,month,1).getDay(), days=new Date(year,month+1,0).getDate();
  const dailyTotals={};
  monthExpenses().forEach(e=>dailyTotals[e.date]=(dailyTotals[e.date]||0)+Number(e.amount||0));
  const grid=$("calendarGrid"); grid.innerHTML="";
  for(let i=0;i<firstDay;i++){const blank=document.createElement("div");blank.className="calendar-day empty";grid.append(blank);}
  for(let day=1;day<=days;day++){
    const date=`${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    const amount=dailyTotals[date]||0;
    const button=document.createElement("button");
    button.className="calendar-day"+(amount?" has-expense":"")+(date===selectedDate?" selected":"")+(date===todayISO()?" today":"");
    button.innerHTML=`<span class="day-number">${day}</span>${amount?`<span class="day-amount">${safeText(money(amount))}</span>`:""}`;
    button.setAttribute("aria-label",`${month+1}月${day}日${amount?` 支出 ${amount}円`:""}`);
    button.addEventListener("click",()=>{selectedDate=date;renderCalendar();renderDailyList();});
    grid.append(button);
  }
}

function renderDailyList() {
  const items=expenses.filter(e=>e.date===selectedDate).sort((a,b)=>(b.createdAtMs||0)-(a.createdAtMs||0));
  const [y,m,d]=selectedDate.split("-").map(Number);
  $("selectedDateTitle").textContent=`${m}月${d}日の支出`;
  $("selectedDayTotal").textContent=money(total(items));
  const list=$("dailyExpenseList"); list.innerHTML="";
  if(!items.length){list.innerHTML='<div class="empty-state"><span>☾</span>この日の支出はまだありません。<br>右下の「＋」から登録できます。</div>';return;}
  items.forEach(e=>{
    const row=document.createElement("article");row.className="expense-row";
    row.innerHTML=`<div class="category-icon">${ICONS[e.category]||"✦"}</div><div class="expense-info"><strong>${safeText(e.detail)}</strong><p>${safeText(e.category)}${e.memo?` · ${safeText(e.memo)}`:""}</p></div><div class="expense-right"><div class="expense-price">${money(e.amount)}</div><div class="expense-actions"><button class="tiny-action" data-edit="${safeText(e.id)}">編集</button><button class="tiny-action" data-delete="${safeText(e.id)}">削除</button></div></div>`;
    list.append(row);
  });
  list.querySelectorAll("[data-edit]").forEach(b=>b.addEventListener("click",()=>editExpense(b.dataset.edit)));
  list.querySelectorAll("[data-delete]").forEach(b=>b.addEventListener("click",()=>removeExpense(b.dataset.delete)));
}

function renderCategoryChart(items) {
  const sums={};items.forEach(e=>sums[e.category]=(sums[e.category]||0)+Number(e.amount||0));
  const sorted=Object.entries(sums).sort((a,b)=>b[1]-a[1]);
  const chart=$("categoryChart");chart.innerHTML="";
  if(!sorted.length){chart.innerHTML='<div class="empty-state">今月の支出が登録されると、ここにグラフが表示されます。</div>';return;}
  const max=sorted[0][1]||1;
  sorted.forEach(([category,amount])=>{
    const line=document.createElement("div");line.className="category-line";
    line.innerHTML=`<span class="category-name">${ICONS[category]||"✦"} ${safeText(category)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.max(2,amount/max*100)}%"></div></div><span class="category-value">${money(amount)}</span>`;
    chart.append(line);
  });
}

function stopListeners() {
  if(stopRoomListener)stopRoomListener();
  if(stopExpenseListener)stopExpenseListener();
  stopRoomListener=stopExpenseListener=null;
}
function listenToRoom(id) {
  stopListeners(); roomId=id;
  stopRoomListener=onSnapshot(doc(db,"rooms",id),(snap)=>{
    if(!snap.exists()){toast("共有財布が見つかりません");disconnectRoom();return;}
    roomData=snap.data();
    if(!roomData.memberUids?.includes(currentUser.uid)){toast("この共有財布の参加者ではありません");disconnectRoom();return;}
    $("roomCodeDisplay").textContent=id;
    setConnected(true);render();
  },(err)=>{console.error(err);toast("共有財布の読み込みに失敗しました。設定を確認してください。");});
  stopExpenseListener=onSnapshot(collection(db,"rooms",id,"expenses"),(snap)=>{
    expenses=snap.docs.map(d=>({id:d.id,...d.data(),createdAtMs:d.data().createdAt?.toMillis?.()||0}));
    render();
  },(err)=>{console.error(err);toast("支出データを読み込めません。Firestoreルールを確認してください。");});
  localStorage.setItem("ourWalletRoom",id);
}
function disconnectRoom() {
  stopListeners();roomId=null;roomData=null;expenses=[];localStorage.removeItem("ourWalletRoom");setConnected(false);
}
function makeCode() {
  const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";let out="";
  const bytes=crypto.getRandomValues(new Uint8Array(8));for(const b of bytes)out+=chars[b%chars.length];return out;
}
async function createRoom() {
  if(!currentUser)return;
  const btn=$("createRoomButton");btn.disabled=true;
  try {
    let code, ref, snap, attempts=0;
    do { code=makeCode();ref=doc(db,"rooms",code);snap=await getDoc(ref);attempts++; } while(snap.exists()&&attempts<5);
    if(snap.exists())throw new Error("コードを作成できませんでした");
    await setDoc(ref,{memberUids:[currentUser.uid],monthlyBudget:0,createdAt:serverTimestamp(),schemaVersion:1});
    listenToRoom(code);toast("共有財布を作成しました。コードを相手に送ってね！");
  } catch(e){console.error(e);toast("作成できませんでした。Firebaseの設定・ルールを確認してください。");}
  finally{btn.disabled=false;}
}
async function joinRoom() {
  if(!currentUser)return;
  const code=$("roomCodeInput").value.trim().toUpperCase();
  if(!/^[A-HJ-NP-Z2-9]{8}$/.test(code)){toast("8文字の共有コードを入力してください");return;}
  const btn=$("joinRoomButton");btn.disabled=true;
  try {
    const ref=doc(db,"rooms",code), snap=await getDoc(ref);
    if(!snap.exists()){toast("共有財布が見つかりません。コードを確認してください");return;}
    const data=snap.data(), members=data.memberUids||[];
    if(members.includes(currentUser.uid)){listenToRoom(code);toast("共有財布に接続しました");return;}
    if(members.length>=2){toast("この共有財布はすでに2人で利用中です");return;}
    await updateDoc(ref,{memberUids:[...members,currentUser.uid]});
    listenToRoom(code);toast("共有財布に参加しました！");
  } catch(e){console.error(e);toast("参加できませんでした。Firestoreのルールを確認してください。");}
  finally{btn.disabled=false;}
}
async function saveExpense(event) {
  event.preventDefault();
  if(!roomId){toast("先に共有財布へ接続してください");return;}
  const category=$("expenseCategory").value,detail=$("expenseDetail").value.trim(),amount=Number($("expenseAmount").value),date=$("expenseDate").value,memo=$("expenseMemo").value.trim();
  if(!detail||!date||!Number.isFinite(amount)||amount<=0){$("expenseFormError").textContent="詳細・日付・1円以上の金額を入力してください";return;}
  $("expenseFormError").textContent="";
  const editId=$("expenseForm").dataset.editId;
  const data={category,detail,amount,date,memo,updatedAt:serverTimestamp(),updatedBy:currentUser.uid};
  try {
    if(editId) await updateDoc(doc(db,"rooms",roomId,"expenses",editId),data);
    else await addDoc(collection(db,"rooms",roomId,"expenses"),{...data,createdAt:serverTimestamp(),createdBy:currentUser.uid});
    $("expenseDialog").close();$("expenseForm").reset();delete $("expenseForm").dataset.editId;
    selectedDate=date;render();toast(editId?"支出を更新しました":"支出を登録しました");
  } catch(e){console.error(e);$("expenseFormError").textContent="保存できませんでした。通信状態とFirestoreルールを確認してください";}
}
function editExpense(id) {
  const e=expenses.find(x=>x.id===id);if(!e)return;
  $("expenseCategory").value=e.category;$("expenseDetail").value=e.detail;$("expenseAmount").value=e.amount;$("expenseDate").value=e.date;$("expenseMemo").value=e.memo||"";
  $("expenseForm").dataset.editId=id;$("expenseDialog").showModal();
}
async function removeExpense(id) {
  const e=expenses.find(x=>x.id===id);if(!e||!confirm(`「${e.detail}」(${money(e.amount)}) を削除しますか？`))return;
  try{await deleteDoc(doc(db,"rooms",roomId,"expenses",id));toast("支出を削除しました");}
  catch(err){console.error(err);toast("削除できませんでした");}
}
async function saveBudget(event) {
  event.preventDefault();if(!roomId)return;
  const value=Number($("budgetInput").value||0);
  if(!Number.isFinite(value)||value<0){toast("0以上の金額を入力してください");return;}
  try{await updateDoc(doc(db,"rooms",roomId),{monthlyBudget:value});$("budgetDialog").close();toast("予算を保存しました");}
  catch(e){console.error(e);toast("予算を保存できませんでした");}
}
function openExpenseDialog() {
  $("expenseForm").reset();delete $("expenseForm").dataset.editId;$("expenseFormError").textContent="";
  $("expenseDate").value=selectedDate||todayISO();$("expenseDialog").showModal();
}

$("createRoomButton").addEventListener("click",createRoom);
$("joinRoomButton").addEventListener("click",joinRoom);
$("expenseForm").addEventListener("submit",saveExpense);
$("budgetForm").addEventListener("submit",saveBudget);
$("addExpenseFab").addEventListener("click",openExpenseDialog);
$("editBudgetButton").addEventListener("click",()=>{$("budgetInput").value=roomData?.monthlyBudget||"";$("budgetDialog").showModal();});
$("settingsBudgetButton").addEventListener("click",()=>{$("settingsDialog").close();$("budgetInput").value=roomData?.monthlyBudget||"";$("budgetDialog").showModal();});
$("settingsButton").addEventListener("click",()=>$("settingsDialog").showModal());
$("prevMonthButton").addEventListener("click",()=>{monthOffset--;render();});
$("nextMonthButton").addEventListener("click",()=>{monthOffset++;render();});
$("copyCodeButton").addEventListener("click",async()=>{try{await navigator.clipboard.writeText(roomId);toast("共有コードをコピーしました");}catch{toast("共有コードを長押ししてコピーしてください");}});
$("leaveRoomButton").addEventListener("click",()=>{if(confirm("この端末の共有財布との連携を解除しますか？支出データ自体は削除されません。")){disconnectRoom();toast("この端末の連携を解除しました");}});
document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>$(b.dataset.close).close()));
document.querySelectorAll(".nav-item").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll(".nav-item").forEach(x=>x.classList.remove("active"));b.classList.add("active");$(b.dataset.scroll)?.scrollIntoView({behavior:"smooth",block:"start"});}));
$("roomCodeInput").addEventListener("input",e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g,""));

if("serviceWorker" in navigator) window.addEventListener("load",()=>navigator.serviceWorker.register("./service-worker.js").catch(console.warn));
if(!isConfigured()){
  $("connectionStatus").textContent="設定が必要";
  $("createRoomButton").disabled=true;$("joinRoomButton").disabled=true;
  const warning=document.createElement("p");warning.className="error-message";warning.textContent="まず firebase-config.js にFirebaseの設定値を入力してください。詳しくは README.md を確認してください。";$("connectionPanel").append(warning);
} else {
  try {
    const app=initializeApp(firebaseConfig);auth=getAuth(app);db=getFirestore(app);
    signInAnonymously(auth).catch(err=>{console.error(err);toast("匿名認証を有効にしてください");});
    onAuthStateChanged(auth,async(user)=>{
      currentUser=user;
      if(!user)return;
      const saved=localStorage.getItem("ourWalletRoom");
      if(saved&&!roomId){try{const snap=await getDoc(doc(db,"rooms",saved));if(snap.exists()&&snap.data().memberUids?.includes(user.uid))listenToRoom(saved);else localStorage.removeItem("ourWalletRoom");}catch(e){console.error(e);}}
    });
  } catch(e){console.error(e);toast("Firebaseの初期化に失敗しました");}
}
