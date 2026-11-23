import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword, deleteUser, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, serverTimestamp, doc, getDoc, setDoc, runTransaction, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js";
import { firebaseConfig } from "./firebase.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const accountCreatorAuth = getAuth(initializeApp(firebaseConfig, "sellerAccountCreator"));
const db = getFirestore(app);
const functions = getFunctions(app);
const deleteSellerAccount = httpsCallable(functions, "deleteSellerAccount");
const $ = (id) => document.getElementById(id);
const loginView = $("loginView"), appView = $("appView"), pageContent = $("pageContent");
let currentUser = null, currentRole = "admin", currentPage = "dashboard", productsCache = [], customersCache = [];

$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("loginMessage").textContent = "";
  try { await signInWithEmailAndPassword(auth, $("email").value.trim(), $("password").value); }
  catch (err) { $("loginMessage").textContent = friendlyError(err); }
});
$("logoutBtn").addEventListener("click", () => signOut(auth));
onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  loginView.classList.toggle("hidden", !!user);
  appView.classList.toggle("hidden", !user);
  if (user) {
    try {
      const profile = await getDoc(doc(db, "utilisateurs", user.uid));
      currentRole = profile.exists() ? (profile.data().role || "vendeur") : "admin";
    } catch (error) { currentRole = "admin"; }
    $("userEmail").textContent = user.email || "Utilisateur";
    $("topbarUser").textContent = currentRole === "vendeur" ? "Vendeur" : (user.email || "Administrateur");
    applyRoleAccess();
    if (!canAccessPage(currentPage)) currentPage = "sales";
    renderPage(currentPage);
  } else {
    currentRole = "admin";
    currentPage = "dashboard";
    applyRoleAccess();
  }
});

$("todayDate").textContent = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());
$("menuToggle").addEventListener("click", () => {
  const open = $("appSidebar").classList.toggle("open");
  $("menuToggle").setAttribute("aria-expanded", String(open));
  $("menuToggle").setAttribute("aria-label", open ? "Fermer le menu" : "Ouvrir le menu");
});
function closeMobileMenu() {
  $("appSidebar").classList.remove("open");
  $("menuToggle").setAttribute("aria-expanded", "false");
  $("menuToggle").setAttribute("aria-label", "Ouvrir le menu");
}
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && $("appSidebar").classList.contains("open")) {
    closeMobileMenu();
    $("menuToggle").focus();
  }
});
document.addEventListener("click", event => {
  if (window.matchMedia("(max-width: 760px)").matches && $("appSidebar").classList.contains("open") &&
      !$("appSidebar").contains(event.target) && !$("menuToggle").contains(event.target)) closeMobileMenu();
});

// Ajout du raccourci « Clients débiteurs » au menu.
if (!$("debtorsNav")) {
  const debtorsNav = document.createElement("button");
  debtorsNav.id = "debtorsNav";
  debtorsNav.className = "nav-link";
  debtorsNav.dataset.page = "debtors";
  debtorsNav.innerHTML = '₣ <span>Clients débiteurs</span>';
  const invoicesNav = document.querySelector('[data-page="invoices"]');
  invoicesNav?.parentElement.insertBefore(debtorsNav, invoicesNav.nextSibling);
}

// Ajout du module Trésorerie au menu.
if (!$("treasuryNav")) {
  const treasuryNav=document.createElement("button");
  treasuryNav.id="treasuryNav"; treasuryNav.className="nav-link"; treasuryNav.dataset.page="treasury";
  treasuryNav.innerHTML='₣ <span>Trésorerie</span>';
  const purchasesNav=document.querySelector('[data-page="purchases"]');
  purchasesNav?.parentElement.insertBefore(treasuryNav,purchasesNav.nextSibling);
}

// Raccourci vers le rapport de résultat.
if (!$("accountingNav")) {
  const accountingNav = document.createElement("button");
  accountingNav.id = "accountingNav"; accountingNav.className = "nav-link"; accountingNav.dataset.page = "accounting";
  accountingNav.innerHTML = '▤ <span>Comptabilité</span>';
  const expensesNav = document.querySelector('[data-page="expenses"]');
  expensesNav?.parentElement.insertBefore(accountingNav, expensesNav.nextSibling);
}

const sellerAccountsNav = document.createElement("button");
sellerAccountsNav.id = "sellerAccountsNav";
sellerAccountsNav.className = "nav-link";
sellerAccountsNav.dataset.page = "sellerAccounts";
sellerAccountsNav.innerHTML = '♙ <span>Comptes vendeurs</span>';
$("mainNav").append(sellerAccountsNav);

const navIcons = {
  dashboard: "<rect x='3' y='3' width='8' height='8' rx='1'/><rect x='13' y='3' width='8' height='5' rx='1'/><rect x='13' y='10' width='8' height='11' rx='1'/><rect x='3' y='13' width='8' height='8' rx='1'/>",
  products: "<path d='M12 3v18M5 7c3 0 5 2 7 5 2-3 4-5 7-5M5 17c3 0 5-2 7-5 2 3 4 5 7 5'/>",
  stockValue: "<path d='M4 19h16M6 16V8m6 8V4m6 12v-5'/>",
  customers: "<path d='M16 20v-1.5a4.5 4.5 0 0 0-4.5-4.5h-3A4.5 4.5 0 0 0 4 18.5V20'/><circle cx='10' cy='7' r='4'/><path d='M17 11a4 4 0 0 0 0-8m3 17v-1.5a4.5 4.5 0 0 0-3.5-4.4'/>",
  sales: "<path d='M4 17 10 11l4 4 7-8'/><path d='M15 7h6v6'/>", purchases: "<path d='M4 7h16M4 12h10M4 17h7'/><path d='m17 15 3 3-3 3'/>",
  invoices: "<path d='M6 3h9l4 4v14H6z'/><path d='M14 3v5h5M9 13h7M9 17h7'/>", expenses: "<path d='M12 5v14M5 12h14'/>",
  debtors: "<circle cx='12' cy='12' r='9'/><path d='M16 8.5c-.8-.8-2-1.2-3.5-1.2-2 0-3.5 1-3.5 2.5 0 3.8 7 1.2 7 5 0 1.5-1.5 2.5-3.5 2.5-1.5 0-2.7-.4-3.5-1.2M12 5.5v13'/>",
  treasury: "<rect x='3' y='5' width='18' height='15' rx='2'/><path d='M3 9h18M16 14h2'/><path d='M7 5V3h10v2'/>", accounting: "<path d='M4 20h16M6 16l4-5 3 2 5-7'/><path d='M15 6h3v3'/>",
};
document.querySelectorAll("#mainNav [data-page]").forEach(button => {
  const name = button.dataset.page;
  const icon = document.createElement("span");
  icon.className = "nav-icon"; icon.setAttribute("aria-hidden", "true");
  icon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${navIcons[name]||navIcons.dashboard}</svg>`;
  if (button.firstChild?.nodeType === Node.TEXT_NODE) button.firstChild.textContent = "";
  button.insertBefore(icon, button.firstChild);
});

$("mainNav").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-page]");
  if (!btn || !canAccessPage(btn.dataset.page)) return;
  currentPage = btn.dataset.page;
  document.querySelectorAll(".nav-link").forEach(b => b.classList.toggle("active", b === btn));
  $("appSidebar").classList.remove("open");
  $("menuToggle").setAttribute("aria-expanded", "false");
  renderPage(currentPage);
});

function friendlyError(err) {
  const code = err?.code || "";
  if (["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found", "auth/invalid-login-credentials"].includes(code)) return "E-mail ou mot de passe incorrect. Vérifie les identifiants du vendeur.";
  if (code === "auth/user-disabled") return "Ce compte vendeur est désactivé. Contacte l’administrateur.";
  if (code === "auth/too-many-requests") return "Trop de tentatives de connexion. Réessaie plus tard.";
  if (code === "auth/invalid-email") return "L’adresse e-mail n’est pas valide.";
  if (code === "auth/network-request-failed" || code.includes("network")) return "Connexion réseau impossible. Vérifie ta connexion.";
  if (code === "auth/operation-not-allowed") return "La connexion par e-mail et mot de passe n’est pas activée dans Firebase Authentication.";
  if (code === "auth/unauthorized-domain") return "Ce domaine n’est pas autorisé dans Firebase Authentication.";
  console.error("Échec de connexion", code || err?.message);
  return "Connexion impossible. Vérifie l’e-mail et le mot de passe, puis réessaie.";
}
function formatNumber(value, options = {}) {
  return new Intl.NumberFormat("fr-FR", options).format(Number(value || 0)).replace(/[\u00a0\u202f]/g, " ");
}
function money(value) { return formatNumber(value) + " FCFA"; }
function showToast(text) { const t=$("appMessage"); t.textContent=text; t.classList.add("show"); setTimeout(()=>t.classList.remove("show"),2600); }
function pageHeader(title, sub="") { return `<div class="panel-head"><div><h2>${title}</h2>${sub?`<div class="section-sub">${sub}</div>`:""}</div></div>`; }

async function renderPage(page) {
  const titles = {dashboard:"Tableau de bord",products:"Produits & stocks",customers:"Clients",sales:"Ventes",purchases:"Achats",invoices:"Factures",expenses:"Dépenses",debtors:"Clients débiteurs",treasury:"Trésorerie",accounting:"Comptabilité",sellerAccounts:"Comptes vendeurs"};
  if (!canAccessPage(page)) return;
  $("pageTitle").textContent = titles[page] || "CRM";
  if (page === "sellerAccounts") return renderSellerAccounts();
  if (page === "dashboard") return renderDashboard();
  if (page === "products") return renderProducts();
  if (page === "stockValue") return renderStockValue();
  if (page === "customers") return renderCustomers();
  if (page === "sales") return renderSales();
  if (page === "purchases") return renderPurchases();
  if (page === "invoices") return renderInvoices();
  if (page === "debtors") return renderDebtors();
  if (page === "treasury") return renderTreasury();
  if (page === "expenses") return renderExpenses();
  if (page === "accounting") return renderAccounting();
  pageContent.innerHTML = `<div class="panel">${pageHeader(titles[page] || "Module")}<div class="empty">Ce module sera développé dans la prochaine étape.</div></div>`;
}

const sellerPages = new Set(["sales", "expenses"]);
function canAccessPage(page) { return currentRole !== "vendeur" || sellerPages.has(page); }
function applyRoleAccess() {
  document.querySelectorAll("#mainNav [data-page]").forEach(link => link.classList.toggle("hidden", !canAccessPage(link.dataset.page)));
}

async function renderSellerAccounts() {
  pageContent.innerHTML = '<div class="panel"><div class="panel-head"><div><h2>Créer un compte vendeur</h2><div class="section-sub">Le vendeur pourra se connecter avec cet e-mail et ce mot de passe.</div></div></div>' +
    '<form id="sellerAccountForm"><div class="form-grid"><div><label for="sellerName">Nom du vendeur</label><input id="sellerName" name="name" autocomplete="name" required></div>' +
    '<div><label for="sellerEmail">Adresse e-mail</label><input id="sellerEmail" name="email" type="email" autocomplete="email" required></div>' +
    '<div><label for="sellerPassword">Mot de passe provisoire</label><div class="password-field-row"><input id="sellerPassword" name="password" type="password" minlength="6" autocomplete="new-password" required><button id="toggleSellerPassword" class="secondary" type="button" aria-pressed="false">Afficher</button></div><small class="field-help">Au moins 6 caractères. Communiquez-le au vendeur de manière privée.</small></div></div>' +
    '<p id="sellerAccountMessage" class="message" aria-live="polite"></p><div class="form-actions"><button id="createSellerButton" class="primary" type="submit">Créer le compte</button></div></form></div>' +
    '<div class="panel"><div class="panel-head"><div><h2>Vendeurs enregistrés</h2><div class="section-sub">Modifie le nom ou envoie un lien de réinitialisation du mot de passe.</div></div></div><div class="table-wrap"><table><thead><tr><th>Nom</th><th>Adresse e-mail</th><th>Compte</th><th>Actions</th></tr></thead><tbody id="sellerAccountRows"><tr><td colspan="4" class="empty">Chargement…</td></tr></tbody></table></div></div>';
  $("toggleSellerPassword").onclick = event => {
    const input = $("sellerPassword"), visible = input.type === "password";
    input.type = visible ? "text" : "password";
    event.currentTarget.textContent = visible ? "Masquer" : "Afficher";
    event.currentTarget.setAttribute("aria-pressed", String(visible));
  };
  $("sellerAccountForm").onsubmit = async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget), button = $("createSellerButton"), message = $("sellerAccountMessage");
    button.disabled = true; message.textContent = "";
    let createdUser = null;
    try {
      const credential = await createUserWithEmailAndPassword(accountCreatorAuth, String(form.get("email")).trim(), String(form.get("password")));
      createdUser = credential.user;
      await setDoc(doc(db, "utilisateurs", createdUser.uid), { name: String(form.get("name")).trim(), email: createdUser.email, role: "vendeur", createdAt: serverTimestamp(), createdBy: currentUser.uid });
      message.classList.add("success-message");
      message.textContent = "Compte vendeur créé. Le vendeur peut maintenant se connecter.";
      event.currentTarget.reset();
      $("sellerPassword").type = "password";
      $("toggleSellerPassword").textContent = "Afficher";
      $("toggleSellerPassword").setAttribute("aria-pressed", "false");
      await loadSellerAccounts();
    } catch (error) {
      if (createdUser) {
        try { await deleteUser(createdUser); } catch (cleanupError) { console.error("Nettoyage du compte vendeur incomplet", cleanupError); }
      }
      message.classList.remove("success-message");
      const sellerErrors = {
        "auth/email-already-in-use": "Cette adresse e-mail possède déjà un compte.",
        "auth/weak-password": "Le mot de passe doit contenir au moins 6 caractères.",
        "auth/invalid-email": "L’adresse e-mail n’est pas valide.",
        "auth/operation-not-allowed": "La connexion par e-mail et mot de passe n’est pas activée dans Firebase Authentication.",
        "auth/unauthorized-domain": "Ce domaine n’est pas autorisé dans Firebase Authentication. Ajoute localhost aux domaines autorisés.",
        "auth/invalid-api-key": "La clé Firebase est invalide. Vérifie la configuration du projet.",
        "auth/network-request-failed": "Connexion réseau impossible. Vérifie ta connexion puis réessaie.",
        "auth/too-many-requests": "Trop de tentatives. Réessaie un peu plus tard.",
        "auth/quota-exceeded": "La limite de création de comptes Firebase est atteinte. Réessaie plus tard.",
        "auth/user-disabled": "La création de compte est désactivée pour ce projet Firebase.",
        "unavailable": "Firestore est indisponible. Vérifie ta connexion puis réessaie.",
        "deadline-exceeded": "L’enregistrement du profil a pris trop de temps. Vérifie la liste avant de recommencer.",
        "permission-denied": "Firebase Firestore a refusé l’enregistrement du profil vendeur. Vérifie les règles d’accès de la collection utilisateurs.",
        "unauthenticated": "La session administrateur a expiré. Reconnecte-toi puis réessaie."
      };
      console.error("Échec de création du compte vendeur", error.code || error.message);
      message.textContent = sellerErrors[error.code] || `Création impossible (${error.code || "erreur Firebase inconnue"}). Vérifie la console du navigateur.`;
    } finally { button.disabled = false; }
  };
  $("sellerAccountRows").onclick = async event => {
    const button = event.target.closest("[data-seller-action]");
    if (!button) return;
    if (button.dataset.sellerAction === "rename") {
      const name = window.prompt("Nouveau nom du vendeur", button.dataset.name || "");
      if (name === null || !name.trim()) return;
      button.disabled = true;
      try {
        await updateDoc(doc(db, "utilisateurs", button.dataset.id), { name: name.trim() });
        showToast("Nom du vendeur modifié.");
        await loadSellerAccounts();
      } catch (error) { showToast("Modification impossible. Vérifie les droits Firestore."); }
      finally { button.disabled = false; }
      return;
    }
    if (button.dataset.sellerAction === "delete") {
      const sellerEmail = button.dataset.email;
      if (!window.confirm(`Supprimer définitivement le compte vendeur ${sellerEmail} et son profil CRM ? Cette action est irréversible.`)) return;
      button.disabled = true;
      try {
        await deleteSellerAccount({ sellerUid: button.dataset.id });
        showToast("Compte vendeur supprimé.");
        await loadSellerAccounts();
      } catch (error) {
        console.error("Échec de suppression du compte vendeur", error.code || error.message);
        const deleteErrors = {
          "functions/permission-denied": "Suppression refusée : seul l’administrateur autorisé peut supprimer un vendeur.",
          "functions/unauthenticated": "Ta session a expiré. Reconnecte-toi puis réessaie.",
          "functions/not-found": "Compte vendeur introuvable. Actualise la liste puis réessaie.",
          "functions/invalid-argument": "Compte vendeur invalide ou identique au compte administrateur.",
          "functions/unavailable": "Le service de suppression Firebase est indisponible. Réessaie plus tard.",
          "functions/deadline-exceeded": "La suppression prend trop de temps. Vérifie la liste avant de réessayer.",
          "functions/failed-precondition": "La fonction Firebase doit être déployée et configurée avant de supprimer un vendeur."
        };
        showToast(deleteErrors[error.code] || "Suppression impossible. Vérifie le déploiement de la fonction Firebase et les journaux du navigateur.");
      } finally { button.disabled = false; }
      return;
    }
    const email = button.dataset.email;
    if (!email) return;
    button.disabled = true;
    try {
      await sendPasswordResetEmail(auth, email);
      showToast("Lien de réinitialisation envoyé à " + email + ".");
    } catch (error) {
      showToast(error.code === "auth/invalid-email" ? "L’adresse e-mail du vendeur n’est pas valide." : "Envoi impossible. Vérifie les paramètres Firebase et l’adresse du vendeur.");
    } finally { button.disabled = false; }
  };
  await loadSellerAccounts();
}

async function loadSellerAccounts() {
  const rows = $("sellerAccountRows");
  try {
    const profiles = await getDocs(collection(db, "utilisateurs"));
    const sellers = profiles.docs.map(item => Object.assign({ id: item.id }, item.data())).filter(profile => profile.role === "vendeur");
    rows.innerHTML = sellers.length ? sellers.map(profile => '<tr><td>' + escapeHtml(profile.name || "Vendeur") + '</td><td>' + escapeHtml(profile.email || "—") + '</td><td><span class="badge">Actif</span></td><td class="seller-actions"><button class="secondary" type="button" data-seller-action="rename" data-id="' + escapeHtml(profile.id) + '" data-name="' + escapeHtml(profile.name || "Vendeur") + '">Modifier le nom</button><button class="secondary" type="button" data-seller-action="reset" data-email="' + escapeHtml(profile.email || "") + '">Réinitialiser le mot de passe</button><button class="danger" type="button" data-seller-action="delete" data-id="' + escapeHtml(profile.id) + '" data-email="' + escapeHtml(profile.email || "ce vendeur") + '">Supprimer</button></td></tr>').join("") : '<tr><td colspan="4" class="empty">Aucun compte vendeur pour le moment.</td></tr>';
  } catch (error) { rows.innerHTML = '<tr><td colspan="3" class="empty">Impossible de charger les comptes. Vérifiez les droits Firestore.</td></tr>'; }
}

// OUTILS COMPTABLES : dates des anciens documents Firestore et des nouvelles écritures.
function recordDate(value) {
  if (!value) return null;
  const date = value?.toDate ? value.toDate() : value?.seconds ? new Date(value.seconds * 1000) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
function localDateInput(date = new Date()) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
}
function inDateRange(value, from, to) {
  const date = recordDate(value);
  if (!date) return false;
  const start = from ? new Date(`${from}T00:00:00`) : null;
  const end = to ? new Date(`${to}T23:59:59.999`) : null;
  return (!start || date >= start) && (!end || date <= end);
}

// DÉPENSES : nouvelle collection Firestore `depenses`, distincte des achats de stock.
async function renderExpenses() {
  pageContent.innerHTML = `<div class="panel"><div class="panel-head"><div><h2>Dépenses d’exploitation</h2><div class="section-sub">Transport, livraison, emballage, électricité et autres frais hors achats de poissons.</div></div><button id="newExpenseBtn" class="primary">+ Enregistrer une dépense</button></div>
    <div class="toolbar expense-filter"><label for="expenseFrom">Du</label><input id="expenseFrom" type="date"><label for="expenseTo">Au</label><input id="expenseTo" type="date"></div>
    <div class="stats" id="expenseStats"><div class="stat"><span>Total sur la période</span><strong>…</strong></div><div class="stat"><span>Nombre de dépenses</span><strong>…</strong></div></div>
    <div class="table-wrap"><table><thead><tr><th>Date</th><th>Catégorie</th><th>Description</th><th>Moyen de paiement</th><th>Montant</th></tr></thead><tbody id="expenseRows"><tr><td colspan="5" class="empty">Chargement…</td></tr></tbody></table></div></div>`;
  const today = localDateInput();
  const monthStart = new Date(); monthStart.setDate(1);
  $("expenseFrom").value = localDateInput(monthStart); $("expenseTo").value = today;
  $("newExpenseBtn").onclick = showExpenseForm;
  const load = async () => {
    try {
      const expenses = await getCollection("depenses");
      const rows = expenses.filter(e => inDateRange(e.date || e.createdAt, $("expenseFrom").value, $("expenseTo").value)).sort((a,b)=>(recordDate(b.date || b.createdAt)||0)-(recordDate(a.date || a.createdAt)||0));
      const total = rows.reduce((sum,e)=>sum+Number(e.amount||0),0);
      $("expenseStats").innerHTML = `<div class="stat"><span>Total sur la période</span><strong>${money(total)}</strong></div><div class="stat"><span>Nombre de dépenses</span><strong>${formatNumber(rows.length)}</strong></div>`;
      $("expenseRows").innerHTML = rows.length ? rows.map(e=>`<tr><td>${recordDate(e.date||e.createdAt)?.toLocaleDateString("fr-FR")||"—"}</td><td><span class="badge">${escapeHtml(e.category||"Autre")}</span></td><td>${escapeHtml(e.description||"—")}</td><td>${escapeHtml(e.paymentMethod||"—")}</td><td><strong>${money(e.amount)}</strong></td></tr>`).join("") : `<tr><td colspan="5" class="empty">Aucune dépense sur cette période.</td></tr>`;
    } catch (e) { $("expenseRows").innerHTML = `<tr><td colspan="5" class="empty">Impossible de lire les dépenses. Vérifie les règles Firestore pour la collection depenses.</td></tr>`; }
  };
  $("expenseFrom").onchange = load; $("expenseTo").onchange = load; await load();
}
function showExpenseForm() {
  const panel = document.createElement("div"); panel.className = "panel";
  panel.innerHTML = `${pageHeader("Nouvelle dépense","Les dépenses sont enregistrées séparément des achats de stock.")}<form id="expenseForm"><div class="form-grid">
    <div><label>Date de dépense</label><input name="date" type="date" value="${localDateInput()}" required></div>
    <div><label>Catégorie</label><select name="category" required><option>Transport</option><option>Livraison</option><option>Emballage</option><option>Électricité</option><option>Loyer</option><option>Salaires</option><option>Entretien</option><option>Communication</option><option>Autre</option></select></div>
    <div class="span-2"><label>Description</label><input name="description" required maxlength="160" placeholder="Ex. transport des marchandises"></div>
    <div><label>Montant (FCFA)</label><input name="amount" type="number" min="1" step="1" required></div>
    <div><label>Moyen de paiement</label><select name="paymentMethod"><option>Espèces</option><option>Orange Money</option><option>Moov Money</option><option>Virement</option><option>Autre</option></select></div>
  </div><div class="form-actions"><button type="button" id="cancelExpense" class="secondary">Annuler</button><button class="primary" type="submit">Enregistrer</button></div></form>`;
  pageContent.prepend(panel); $("cancelExpense").onclick = () => panel.remove();
  $("expenseForm").onsubmit = async e => {
    e.preventDefault(); const f = new FormData(e.currentTarget); const amount = Number(f.get("amount"));
    if (!Number.isFinite(amount) || amount <= 0) { showToast("Saisis un montant valide."); return; }
    try {
      await addDoc(collection(db,"depenses"), { date: f.get("date"), category: f.get("category"), description: f.get("description").trim(), amount, paymentMethod: f.get("paymentMethod"), createdAt: serverTimestamp(), createdBy: currentUser?.uid || null });
      showToast("Dépense enregistrée."); await renderExpenses();
    } catch (err) { showToast("Enregistrement refusé. Vérifie les règles Firestore pour la collection depenses."); }
  };
}

// COMPTABILITÉ : chiffre d'affaires par date de vente, coût des quantités vendues et dépenses.
async function renderAccounting() {
  pageContent.innerHTML = `<div class="panel"><div class="panel-head"><div><h2>Rapport de résultat</h2><div class="section-sub">Chiffre d’affaires, coût estimé des poissons vendus, dépenses et pertes de stock valorisées.</div></div><div class="panel-actions"><button id="accountingCsv" class="secondary">Exporter CSV</button><button id="accountingPrint" class="secondary">Imprimer</button></div></div>
    <div class="toolbar accounting-filter"><label for="accountingFrom">Du</label><input id="accountingFrom" type="date"><label for="accountingTo">Au</label><input id="accountingTo" type="date"><button id="accountingRefresh" class="secondary">Actualiser</button></div>
    <div class="stats" id="accountingStats"><div class="stat"><span>Chiffre d’affaires</span><strong>…</strong></div><div class="stat"><span>Coût estimé vendu</span><strong>…</strong></div><div class="stat"><span>Dépenses</span><strong>…</strong></div><div class="stat"><span>Bénéfice estimé</span><strong>…</strong></div></div>
    <p id="accountingNote" class="field-help"></p></div>
    <div class="panel"><div class="panel-head"><div><h2>Détail des ventes et charges</h2><div class="section-sub">Les règlements ne sont pas additionnés au chiffre d’affaires. Les paiements fournisseurs ne sont pas déduits ici.</div></div></div><div class="table-wrap"><table><thead><tr><th>Date</th><th>Opération</th><th>Référence / détail</th><th>Recettes</th><th>Coût vendu / dépense</th><th>Résultat</th></tr></thead><tbody id="accountingRows"><tr><td colspan="6" class="empty">Chargement…</td></tr></tbody></table></div></div>`;
  const today = localDateInput(); const monthStart = new Date(); monthStart.setDate(1);
  $("accountingFrom").value = localDateInput(monthStart); $("accountingTo").value = today;
  let reportRows = [];
  const load = async () => {
    try {
      // Le rapport de résultat dépend uniquement des ventes, achats et dépenses.
      // Les mouvements de stock sont complémentaires : leur indisponibilité ne doit
      // pas empêcher l'affichage des données comptables principales.
      const [sales, purchases, expenses] = await Promise.all([
        getCollection("ventes"),
        getCollection("achats"),
        getCollection("depenses")
      ]);
      let stockMovements = [];
      try {
        stockMovements = await getCollection("mouvements_stock");
      } catch (stockError) {
        console.warn("Mouvements de stock indisponibles pour le rapport comptable :", stockError);
      }
      const costByProduct = new Map();
      purchases.forEach(p => {
        const kg = Number(p.quantityKg || (p.unit === "kg" ? p.quantity : 0) || 0);
        // costTotal inclut le prix fournisseur et les frais d'approche affectés à ce lot.
        const cost = Number(p.costTotal ?? p.total ?? (Number(p.unitPrice||0) * Number(p.quantity||0)) ?? 0);
        if (!p.productId || kg <= 0 || cost < 0) return;
        const history = costByProduct.get(p.productId) || [];
        history.push({kg,cost,date:recordDate(p.date||p.createdAt)}); costByProduct.set(p.productId,history);
      });
      const result = []; let missingCostCount = 0;
      sales.filter(s=>inDateRange(s.date||s.createdAt,$("accountingFrom").value,$("accountingTo").value)).forEach(s=>{
        const saleDate=recordDate(s.date||s.createdAt), revenue = Number(s.total || 0);
        const saleItems = Array.isArray(s.items) && s.items.length ? s.items : [{productId:s.productId, quantityKg:Number(s.quantityKg || (s.unit === "kg" ? s.quantity : 0) || 0), nom:s.productName}];
        let cogs = 0, lineMissing = false;
        saleItems.forEach(item=>{
          const productId = item.productId || item.id;
          const kg = Number(item.quantityKg || (item.unit === "kg" ? item.quantity : 0) || 0);
          const prior = (costByProduct.get(productId)||[]).filter(p=>p.date && saleDate && p.date<=saleDate);
          const weightedKg=prior.reduce((sum,p)=>sum+p.kg,0), weightedCost=prior.reduce((sum,p)=>sum+p.cost,0);
          if (weightedKg > 0 && kg > 0) cogs += (weightedCost / weightedKg) * kg;
          else if (kg > 0) lineMissing = true;
        });
        if (lineMissing || !saleItems.some(item=>Number(item.quantityKg||0)>0)) missingCostCount++;
        result.push({date:recordDate(s.date||s.createdAt), type:"Vente", detail:s.reference||saleItems.map(i=>i.nom||i.productName||"Produit").join(", ")||s.id.slice(0,8), income:revenue, charge:cogs, net:revenue-cogs});
      });
      expenses.filter(e=>inDateRange(e.date||e.createdAt,$("accountingFrom").value,$("accountingTo").value)).forEach(e=>{
        const amount = Number(e.amount||0); result.push({date:recordDate(e.date||e.createdAt),type:"Dépense",detail:`${e.category||"Autre"} — ${e.description||""}`,income:0,charge:amount,net:-amount});
      });
      // Valorisation indicative des pertes/casses au coût moyen des achats antérieurs.
      let unvaluedLossCount = 0;
      stockMovements.filter(m=>["perte","casse"].includes(String(m.type||"").toLowerCase()) && inDateRange(m.date||m.createdAt,$("accountingFrom").value,$("accountingTo").value)).forEach(m=>{
        const movementDate=recordDate(m.date||m.createdAt), kg=Math.abs(Number(m.quantityKg||m.deltaKg||0));
        const prior=(costByProduct.get(m.productId)||[]).filter(p=>p.date&&movementDate&&p.date<=movementDate);
        const weightedKg=prior.reduce((sum,p)=>sum+p.kg,0), weightedCost=prior.reduce((sum,p)=>sum+p.cost,0);
        const valued=weightedKg>0&&kg>0?(weightedCost/weightedKg)*kg:0;
        if(!valued&&kg>0) unvaluedLossCount++;
        result.push({date:movementDate,type:"Perte de stock",detail:`${m.productName||"Produit"} — ${m.note||m.type} (${kg} kg)`,income:0,charge:valued,net:-valued});
      });
      result.sort((a,b)=>(b.date||0)-(a.date||0)); reportRows = result;
      const revenue = result.reduce((s,r)=>s+r.income,0), cogs = result.filter(r=>r.type==="Vente").reduce((s,r)=>s+r.charge,0), expenseTotal = result.filter(r=>r.type==="Dépense").reduce((s,r)=>s+r.charge,0), lossTotal = result.filter(r=>r.type==="Perte de stock").reduce((s,r)=>s+r.charge,0), profit = revenue-cogs-expenseTotal-lossTotal;
      $("accountingStats").innerHTML = `<div class="stat"><span>Chiffre d’affaires</span><strong>${money(revenue)}</strong></div><div class="stat"><span>Coût estimé vendu</span><strong>${money(cogs)}</strong></div><div class="stat"><span>Dépenses</span><strong>${money(expenseTotal)}</strong></div><div class="stat"><span>Pertes de stock valorisées</span><strong>${money(lossTotal)}</strong></div><div class="stat"><span>Bénéfice estimé</span><strong>${money(profit)}</strong></div>`;
      $("accountingNote").textContent = `Coût des marchandises calculé au coût moyen pondéré des achats antérieurs à chaque vente. ${missingCostCount ? `${formatNumber(missingCostCount)} vente(s) sans quantité ou achat correspondant : coût non estimé pour ces lignes.` : "Toutes les ventes de la période ont un coût estimable."} Le stock initial sans achat enregistré n’est pas valorisé. ${unvaluedLossCount ? `${formatNumber(unvaluedLossCount)} perte(s) sans coût d’achat disponible n’ont pas pu être valorisées.` : "Les pertes et casses de la période ont été valorisées selon le coût moyen des achats antérieurs."}`;
      $("accountingRows").innerHTML = result.length ? result.map(r=>`<tr><td>${r.date?.toLocaleDateString("fr-FR")||"—"}</td><td><span class="badge">${r.type}</span></td><td>${escapeHtml(r.detail)}</td><td>${r.income?money(r.income):"—"}</td><td>${r.charge?money(r.charge):"—"}</td><td><strong>${money(r.net)}</strong></td></tr>`).join("") : `<tr><td colspan="6" class="empty">Aucune vente ou dépense sur cette période.</td></tr>`;
    } catch (e) {
      console.error("Erreur de chargement du rapport comptable :", e);
      const message = e?.message ? escapeHtml(e.message) : "Erreur inconnue";
      $("accountingRows").innerHTML = `<tr><td colspan="6" class="empty">Échec du chargement des ventes, achats ou dépenses. Détail : ${message}</td></tr>`;
      showToast("Erreur de lecture du rapport comptable. Consulte le détail affiché dans le tableau.");
    }
  };
  $("accountingRefresh").onclick = load; $("accountingFrom").onchange = load; $("accountingTo").onchange = load;
  $("accountingCsv").onclick = () => {
    const rows = [["Date","Opération","Référence / détail","Recettes FCFA","Coût vendu / dépense FCFA","Résultat FCFA"], ...reportRows.map(r=>[r.date?.toLocaleDateString("fr-FR")||"",r.type,r.detail,r.income,r.charge,r.net])];
    const csv = "\uFEFF" + rows.map(row=>row.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(";")).join("\r\n");
    const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8;"})); const a=document.createElement("a"); a.href=url; a.download=`comptabilite-${$("accountingFrom").value}-${$("accountingTo").value}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  $("accountingPrint").onclick = () => window.print(); await load();
}
async function getCollection(name) {
  const snap = await getDocs(collection(db,name));
  return snap.docs.map(d=>({id:d.id,...d.data()}));
}
async function renderDashboard() {
  pageContent.innerHTML = `<section class="welcome-banner"><div><p class="eyebrow">FRESH FISH MALI · BAMAKO</p><h2>Votre activité, en temps réel</h2><p>Suivez les ventes, les approvisionnements et la trésorerie depuis un seul espace.</p></div><div class="welcome-tools"><span class="live-indicator"><i></i>Données Firebase</span><select id="dashPeriod" aria-label="Période du tableau de bord"><option value="quarter">3 derniers mois</option><option value="month">Ce mois</option><option value="year">Cette année</option><option value="all">Toute l’activité</option></select></div></section>
    <div class="stats dashboard-stats"><article class="stat stat-coral"><span class="stat-icon">↗</span><span class="stat-label">Chiffre d’affaires</span><strong id="dashRevenue">…</strong><small id="dashRevenueNote">Période sélectionnée</small></article><article class="stat"><span class="stat-icon">◷</span><span class="stat-label">Ventes du jour</span><strong id="dashTodaySales">…</strong><small>Montant facturé aujourd’hui</small></article><article class="stat"><span class="stat-icon">⌁</span><span class="stat-label">Bénéfice brut estimé</span><strong id="dashGross">…</strong><small id="dashGrossNote">Ventes moins coût moyen estimé</small></article><article class="stat"><span class="stat-icon">＋</span><span class="stat-label">Bénéfice net estimé</span><strong id="dashNet">…</strong><small id="dashNetNote">Après dépenses d’exploitation</small></article><article class="stat"><span class="stat-icon">−</span><span class="stat-label">Dépenses</span><strong id="dashExpenses">…</strong><small>Période sélectionnée</small></article><article class="stat"><span class="stat-icon">↓</span><span class="stat-label">Achats et approvisionnements</span><strong id="dashPurchases">…</strong><small>Période sélectionnée</small></article><article class="stat"><span class="stat-icon">◌</span><span class="stat-label">Créances clients</span><strong id="dashReceivables">…</strong><small>Solde restant à encaisser</small></article><article class="stat"><span class="stat-icon">⇢</span><span class="stat-label">Dettes fournisseurs</span><strong id="dashPayables">…</strong><small>Solde restant à payer</small></article><article class="stat stat-mint"><span class="stat-icon">♧</span><span class="stat-label">Valeur estimée du stock</span><strong id="dashStockValue">…</strong><small id="dashStockNote">Quantités au coût moyen connu</small></article></div>
    <div class="dashboard-grid"><div class="panel revenue-panel"><div class="panel-head"><div><h2>Revenus et bénéfices</h2><div class="section-sub">Évolution mensuelle · FCFA</div></div><span class="badge badge-soft">Analyse</span></div><div id="salesChart" class="sales-chart"><div class="empty">Chargement des données…</div></div></div>
    <div class="panel quick-panel"><div class="panel-head"><div><h2>Actions rapides</h2><div class="section-sub">Accès direct aux opérations</div></div></div><div class="quick-actions"><button class="quick-action" data-go="sales"><span>↗</span>Enregistrer une vente</button><button class="quick-action" data-go="purchases"><span>↙</span>Enregistrer un achat</button><button class="quick-action" data-go="expenses"><span>−</span>Ajouter une dépense</button><button class="quick-action" data-go="invoices"><span>▤</span>Factures et règlements</button><button class="quick-action" data-go="customers"><span>♙</span>Gérer les clients</button><button class="quick-action" data-go="products"><span>♧</span>Gérer le stock</button></div></div></div>
    <div class="dashboard-grid dashboard-lower"><div class="panel"><div class="panel-head"><div><h2>Dépenses par catégorie</h2><div class="section-sub">Répartition sur la période sélectionnée</div></div><button class="secondary" data-go="expenses">Voir les dépenses →</button></div><div id="expenseBreakdown" class="expense-breakdown"><div class="empty">Chargement…</div></div></div><div class="panel"><div class="panel-head"><div><h2>Factures à suivre</h2><div class="section-sub"><span id="dashInvoiceCount">…</span> règlement(s) attendu(s)</div></div><button class="secondary" data-go="debtors">Voir les créances →</button></div><div id="dashInvoiceRows" class="invoice-queue"><div class="empty">Chargement…</div></div></div></div>
    <div class="panel category-panel"><div class="panel-head"><div><h2>Ventes par catégorie de produits</h2><div class="section-sub">Répartition du chiffre d’affaires · période sélectionnée</div></div><button class="secondary" data-go="products">Voir les produits →</button></div><div id="salesByCategory" class="expense-breakdown"><div class="empty">Chargement…</div></div></div>
    <div class="panel recent-panel"><div class="panel-head"><div><h2>Activité récente</h2><div class="section-sub">Dernières ventes, achats, dépenses et règlements</div></div></div><div class="table-wrap"><table><thead><tr><th>Type</th><th>Date</th><th>Référence / détail</th><th>Tiers</th><th>Montant</th></tr></thead><tbody id="dashRecentRows"><tr><td colspan="5" class="empty">Chargement…</td></tr></tbody></table></div></div>
    <div class="panel" id="lowStockPanel"><div class="empty">Chargement des alertes de stock…</div></div>`;
  pageContent.querySelectorAll("[data-go]").forEach(button => button.addEventListener("click", () => {
    const page = button.dataset.go;
    currentPage = page;
    document.querySelectorAll(".nav-link").forEach(link => link.classList.toggle("active", link.dataset.page === page));
    renderPage(page);
  }));
  try {
    const [products, sales, purchases, expenses] = await Promise.all([getCollection("produits"),getCollection("ventes"),getCollection("achats"),getCollection("depenses")]);
    let payments=[]; try { payments=await getCollection("paiements"); } catch (paymentError) { console.warn("Paiements indisponibles pour l’activité du tableau de bord :",paymentError); }
    let stockMovements=[]; try { stockMovements=await getCollection("mouvements_stock"); } catch (stockError) { console.warn("Mouvements de stock indisponibles pour les estimations du tableau de bord :",stockError); }
    const withDate = rows => rows.map(row=>({...row,dashboardDate:recordDate(row.date||row.createdAt)}));
    const datedSales=withDate(sales).filter(s=>s.dashboardDate).sort((a,b)=>b.dashboardDate-a.dashboardDate), datedPurchases=withDate(purchases), datedExpenses=withDate(expenses);
    const paymentRows=withDate(payments);
    const purchaseCostMap=new Map();
    purchases.forEach(p=>{const kg=Number(p.quantityKg||(p.unit==="kg"?p.quantity:0)||0),cost=Number(p.costTotal??p.total??0);if(!p.productId||kg<=0||cost<0)return;const history=purchaseCostMap.get(p.productId)||[];history.push({kg,cost,date:recordDate(p.date||p.createdAt)});purchaseCostMap.set(p.productId,history);});
    const saleCost=s=>{let value=0,complete=true;const items=Array.isArray(s.items)&&s.items.length?s.items:[{productId:s.productId,quantityKg:Number(s.quantityKg||0)}];items.forEach(item=>{const productId=item.productId||item.id,kg=Number(item.quantityKg||(item.unit==="kg"?item.quantity:0)||0);if(!productId||kg<=0){complete=false;return;}const prior=(purchaseCostMap.get(productId)||[]).filter(p=>p.date&&s.dashboardDate&&p.date<=s.dashboardDate),kgBought=prior.reduce((sum,p)=>sum+p.kg,0),costBought=prior.reduce((sum,p)=>sum+p.cost,0);if(!kgBought){complete=false;return;}value+=(costBought/kgBought)*kg;});return {value,complete};};
    const balances=row=>{const total=Number(row.total||0),paid=Number(row.paidAmount||row.montantPaye||row.paye||row.totalPaye||0),history=Array.isArray(row.paymentHistory)?row.paymentHistory:[],resolvedPaid=paid||history.reduce((sum,p)=>sum+Number(p.amount||0),0);return Math.max(0,total-resolvedPaid);};
    const today=new Date();today.setHours(0,0,0,0);const periodBounds=()=>{const period=$("dashPeriod").value,from=new Date(today);if(period==="month")from.setDate(1);else if(period==="quarter")from.setMonth(from.getMonth()-2,1);else if(period==="year")from.setMonth(0,1);else return {from:null,to:null};return {from,to:new Date()};};
    const updateDashboard=()=>{
      const {from,to}=periodBounds(),inPeriod=row=>row.dashboardDate&&(!from||row.dashboardDate>=from)&&(!to||row.dashboardDate<=to);
      const visibleSales=datedSales.filter(inPeriod),visiblePurchases=datedPurchases.filter(inPeriod),visibleExpenses=datedExpenses.filter(inPeriod);
      const revenue=visibleSales.reduce((sum,s)=>sum+Number(s.total||0),0),daySales=datedSales.filter(s=>s.dashboardDate>=today&&s.dashboardDate<new Date(today.getTime()+86400000)).reduce((sum,s)=>sum+Number(s.total||0),0);
      let cogs=0,unvalued=0;visibleSales.forEach(s=>{const cost=saleCost(s);cogs+=cost.value;if(!cost.complete)unvalued++;});
      const expenseTotal=visibleExpenses.reduce((sum,e)=>sum+Number(e.amount||0),0),purchaseTotal=visiblePurchases.reduce((sum,p)=>sum+Number(p.costTotal??p.total??0),0);
      const lossTotal=stockMovements.filter(m=>["perte","casse"].includes(String(m.type||"").toLowerCase())&&inPeriod({...m,dashboardDate:recordDate(m.date||m.createdAt)})).reduce((sum,m)=>{const date=recordDate(m.date||m.createdAt),kg=Math.abs(Number(m.quantityKg||m.deltaKg||0)),prior=(purchaseCostMap.get(m.productId)||[]).filter(p=>p.date&&date&&p.date<=date),kgBought=prior.reduce((a,p)=>a+p.kg,0),costBought=prior.reduce((a,p)=>a+p.cost,0);return kgBought>0?sum+(costBought/kgBought)*kg:sum;},0);
      const receivable=sales.reduce((sum,s)=>sum+balances(s),0),payable=purchases.reduce((sum,p)=>sum+balances(p),0);
      const costByProduct=new Map();purchaseCostMap.forEach((history,id)=>{const kg=history.reduce((sum,p)=>sum+p.kg,0),cost=history.reduce((sum,p)=>sum+p.cost,0);if(kg>0)costByProduct.set(id,cost/kg);});
      const stockValue=products.reduce((sum,p)=>sum+Math.max(0,Number(p.stockKg||0))*(costByProduct.get(p.id)||0),0),unvaluedStock=products.filter(p=>Number(p.stockKg||0)>0&&!costByProduct.has(p.id)).length;
      $("dashRevenue").textContent=money(revenue);$("dashTodaySales").textContent=money(daySales);$("dashGross").textContent=money(revenue-cogs);$("dashNet").textContent=money(revenue-cogs-expenseTotal-lossTotal);$("dashExpenses").textContent=money(expenseTotal);$("dashPurchases").textContent=money(purchaseTotal);$("dashReceivables").textContent=money(receivable);$("dashPayables").textContent=money(payable);$("dashStockValue").textContent=money(stockValue);
      $("dashGross").classList.toggle("negative-value",revenue-cogs<0);$("dashNet").classList.toggle("negative-value",revenue-cogs-expenseTotal-lossTotal<0);
      const estimateNote=unvalued?`${unvalued} vente(s) sans coût d’achat estimable`:`Coût moyen pondéré des achats`;$("dashGrossNote").textContent=estimateNote;$("dashNetNote").textContent=unvalued?`${unvalued} vente(s) non valorisée(s) · estimation incomplète`:`Dépenses et pertes valorisées · estimation indicative`;
      $("dashRevenueNote").textContent=$("dashPeriod").selectedOptions[0].text;$("dashStockNote").textContent=unvaluedStock?`${formatNumber(unvaluedStock)} produit(s) sans coût connu exclus`:`${formatNumber(products.reduce((sum,p)=>sum+Number(p.stockKg||0),0))} kg · coût moyen des achats`;
      const byMonth=new Map();visibleSales.forEach(s=>{const key=`${s.dashboardDate.getFullYear()}-${s.dashboardDate.getMonth()}`;const item=byMonth.get(key)||{revenue:0,cost:0,date:s.dashboardDate};item.revenue+=Number(s.total||0);item.cost+=saleCost(s).value;byMonth.set(key,item);});
      const monthly=[...byMonth.values()].sort((a,b)=>a.date-b.date).slice(-6),max=Math.max(1,...monthly.map(m=>m.revenue));
      $("salesChart").innerHTML=monthly.length?`<div class="chart-legend"><span><i class="legend-revenue"></i>Chiffre d’affaires</span><span><i class="legend-profit"></i>Bénéfice brut estimé</span></div><div class="chart-bars" role="img" aria-label="Ventes et bénéfice brut mensuels">${monthly.map(m=>{const gross=Math.max(0,m.revenue-m.cost);return `<div class="chart-column" title="${m.date.toLocaleDateString("fr-FR",{month:"long",year:"numeric"})} · CA ${money(m.revenue)} · bénéfice brut estimé ${money(gross)}"><span class="chart-value">${formatNumber(m.revenue)}</span><span class="chart-bar-pair"><i class="chart-bar" style="--bar-height:${Math.max(m.revenue/max*100,3)}%"></i><i class="chart-bar chart-profit" style="--bar-height:${Math.max(gross/max*100,3)}%"></i></span><span class="chart-month">${m.date.toLocaleDateString("fr-FR",{month:"short"})}</span></div>`;}).join("")}</div><div class="chart-summary"><strong>${money(revenue)}</strong><span>${unvalued?`${formatNumber(unvalued)} vente(s) sans coût estimable · `:""}CA de la période</span></div>`:`<div class="empty">Aucune vente dans cette période.</div>`;
      const categories=new Map();visibleExpenses.forEach(e=>{const key=e.category||"Autre";categories.set(key,(categories.get(key)||0)+Number(e.amount||0));});const expenseGroups=[...categories].sort((a,b)=>b[1]-a[1]).slice(0,5),expenseMax=Math.max(1,...expenseGroups.map(x=>x[1]));
      $("expenseBreakdown").innerHTML=expenseGroups.length?expenseGroups.map(([name,amount])=>`<div class="expense-row"><span>${escapeHtml(name)}</span><div class="expense-track"><i style="--expense-width:${amount/expenseMax*100}%"></i></div><strong>${money(amount)}</strong></div>`).join(""):`<div class="empty">Aucune dépense sur la période.</div>`;
      const productsById=new Map(products.map(p=>[p.id,p])),categoryRevenue=new Map();
      visibleSales.forEach(s=>{const items=Array.isArray(s.items)&&s.items.length?s.items:[{productId:s.productId,total:s.total}];const itemTotal=items.reduce((sum,item)=>sum+Number(item.total||0),0);items.forEach(item=>{const product=productsById.get(item.productId||item.id),category=product?.categorie||"Autres produits",share=itemTotal?Number(item.total||0)/itemTotal:Number(items.length?1/items.length:1);categoryRevenue.set(category,(categoryRevenue.get(category)||0)+Number(s.total||0)*share);});});
      const categoryGroups=[...categoryRevenue].sort((a,b)=>b[1]-a[1]).slice(0,6),categoryMax=Math.max(1,...categoryGroups.map(x=>x[1]));
      $("salesByCategory").innerHTML=categoryGroups.length?categoryGroups.map(([name,amount])=>`<div class="expense-row"><span>${escapeHtml(name)}</span><div class="expense-track"><i style="--expense-width:${amount/categoryMax*100}%"></i></div><strong>${money(amount)}</strong></div>`).join(""):`<div class="empty">Aucune vente enregistrée sur la période.</div>`;
      const invoices=datedSales.filter(s=>balances(s)>0).sort((a,b)=>balances(b)-balances(a));$("dashInvoiceCount").textContent=invoices.length;$("dashInvoiceRows").innerHTML=invoices.length?invoices.slice(0,4).map(s=>`<div class="invoice-entry"><span><strong>${escapeHtml(s.customerName||"Client de passage")}</strong><small>${escapeHtml(s.invoiceNumber||s.reference||s.id.slice(0,8))}</small></span><b>${money(balances(s))}</b></div>`).join(""):`<div class="empty">Aucune facture en attente de règlement.</div>`;
      const events=[...datedSales.map(s=>({date:s.dashboardDate,type:"Vente",ref:s.reference||s.invoiceNumber||s.id.slice(0,8),third:s.customerName||"Client de passage",amount:Number(s.total||0),direction:"in"})),...datedPurchases.filter(p=>p.dashboardDate).map(p=>({date:p.dashboardDate,type:"Achat",ref:p.reference||p.id.slice(0,8),third:p.supplierName||"Fournisseur",amount:Number(p.costTotal??p.total??0),direction:"out"})),...datedExpenses.filter(e=>e.dashboardDate).map(e=>({date:e.dashboardDate,type:"Dépense",ref:e.category||"Autre",third:e.description||"Dépense",amount:Number(e.amount||0),direction:"out"})),...paymentRows.filter(p=>p.dashboardDate).map(p=>({date:p.dashboardDate,type:p.type==="purchase"||p.purchaseId?"Règlement achat":"Règlement reçu",ref:String(p.saleId||p.purchaseId||"").slice(0,8)||"Paiement",third:p.method||"Règlement",amount:Number(p.amount||0),direction:p.type==="purchase"||p.purchaseId?"out":"in"}))].sort((a,b)=>b.date-a.date);
      $("dashRecentRows").innerHTML=events.length?events.slice(0,7).map(e=>`<tr><td><span class="badge ${e.direction==="out"?"badge-out":""}">${escapeHtml(e.type)}</span></td><td>${e.date.toLocaleDateString("fr-FR")}</td><td>${escapeHtml(e.ref)}</td><td>${escapeHtml(e.third)}</td><td class="${e.direction==="out"?"amount-out":"amount-in"}"><strong>${e.direction==="out"?"−":"+"} ${money(e.amount)}</strong></td></tr>`).join(""):`<tr><td colspan="5" class="empty">Aucune activité enregistrée.</td></tr>`;
    };
    $("dashPeriod").addEventListener("change",updateDashboard);updateDashboard();
    const lowStock = products.filter(p => p.actif !== false && p.stockKg !== undefined && Number(p.stockKg || 0) <= Number(p.stockAlertKg ?? 0));
    const alertPanel = $("lowStockPanel");
    alertPanel.innerHTML = `<div class="panel-head"><div><h2>Stocks à réapprovisionner</h2><div class="section-sub">${lowStock.length} produit(s) au seuil d’alerte ou en dessous</div></div><div class="panel-actions"><button class="secondary" id="exportReplenishmentReport" ${lowStock.length ? "" : "disabled"}>Exporter le rapport CSV</button><button class="secondary" id="printReplenishmentReport" ${lowStock.length ? "" : "disabled"}>Imprimer le rapport</button><button class="secondary" id="openProductsFromAlert">Voir les produits</button></div></div>` +
      (lowStock.length ? `<div class="table-wrap"><table class="low-stock-table"><thead><tr><th>Produit</th><th>Stock actuel</th><th>Seuil d’alerte</th><th>À commander pour atteindre le seuil</th><th>État</th></tr></thead><tbody>${lowStock.map(p=>{const stockNow=Number(p.stockKg||0), threshold=Number(p.stockAlertKg??0), qty=Math.max(0,threshold-stockNow);return `<tr><td><strong>${escapeHtml(p.nom||"Sans nom")}</strong></td><td><strong>${formatNumber(stockNow)} kg</strong></td><td>${formatNumber(threshold)} kg</td><td><strong>${formatNumber(qty)} kg</strong></td><td><span class="badge badge-low">Stock faible</span></td></tr>`}).join("")}</tbody></table></div><p class="muted report-note">La quantité proposée permet de revenir au seuil d’alerte. Ajuste-la selon tes ventes prévues et les quantités minimales du fournisseur.</p>` : `<p class="stock-ok">Aucun produit n’est actuellement sous son seuil d’alerte.</p>`);
    const reportRows = lowStock.map(p=>({name:p.nom||"Sans nom",stock:Number(p.stockKg||0),threshold:Number(p.stockAlertKg??0),qty:Math.max(0,Number(p.stockAlertKg??0)-Number(p.stockKg||0)),category:p.categorie||""}));
    $("exportReplenishmentReport")?.addEventListener("click",()=>{const rows=[["Produit","Catégorie","Stock actuel (kg)","Seuil d’alerte (kg)","Quantité à commander pour atteindre le seuil (kg)"],...reportRows.map(r=>[r.name,r.category,r.stock,r.threshold,r.qty])];const csv="\uFEFF"+rows.map(row=>row.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(";")).join("\\r\\n");const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`rapport-reapprovisionnement-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(url);});
    $("printReplenishmentReport")?.addEventListener("click",()=>{const body=reportRows.map(r=>`<tr><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.category)}</td><td>${formatNumber(r.stock)} kg</td><td>${formatNumber(r.threshold)} kg</td><td><strong>${formatNumber(r.qty)} kg</strong></td><td></td></tr>`).join("");const w=window.open("","_blank");if(!w){showToast("Autorise les fenêtres pop-up pour imprimer le rapport.");return;}w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Rapport de réapprovisionnement</title><style>body{font:14px Arial,sans-serif;padding:24px;color:#222}h1{font-size:22px}p{color:#555}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #ccc;padding:9px;text-align:left}th{background:#f1f1f1}.sign{margin-top:30px}@media print{button{display:none}}</style></head><body><h1>Fresh Fish Mali — Rapport de réapprovisionnement</h1><p>Édité le ${new Date().toLocaleDateString("fr-FR")} • ${reportRows.length} produit(s) à réapprovisionner</p><table><thead><tr><th>Produit</th><th>Catégorie</th><th>Stock actuel</th><th>Seuil d’alerte</th><th>Qté suggérée</th><th>Qté commandée / notes</th></tr></thead><tbody>${body}</tbody></table><p class="sign">Fournisseur : ____________________ &nbsp;&nbsp; Date de commande : ____________________</p><script>window.onload=()=>window.print();</script></body></html>`);w.document.close();});
    $("openProductsFromAlert").onclick=()=>{currentPage="products";document.querySelectorAll(".nav-link").forEach(b=>b.classList.toggle("active",b.dataset.page==="products"));renderPage("products");};
  } catch(e) { showToast("Impossible de charger les données. Vérifie les règles Firestore."); }
}
// ÉTAT DE STOCK VALORISÉ : quantité disponible et coût moyen connu des achats.
async function renderStockValue() {
  pageContent.innerHTML = `<div class="panel"><div class="panel-head"><div><h2>État de stock valorisé</h2><div class="section-sub">Valorisation indicative du stock disponible au coût moyen pondéré des achats enregistrés, frais d’approche inclus.</div></div><div class="panel-actions"><button id="stockValueCsv" class="secondary">Exporter CSV</button><button id="stockValuePrint" class="secondary">Imprimer</button></div></div><div class="stats" id="stockValueStats"><div class="stat"><span>Quantité disponible</span><strong>…</strong></div><div class="stat"><span>Valeur estimée</span><strong>…</strong></div><div class="stat"><span>Produits non valorisés</span><strong>…</strong></div></div><p id="stockValueNote" class="field-help"></p><div class="table-wrap"><table><thead><tr><th>Produit</th><th>Stock disponible (kg)</th><th>Coût moyen / kg</th><th>Valeur estimée</th><th>Seuil d’alerte</th><th>État</th></tr></thead><tbody id="stockValueRows"><tr><td colspan="6" class="empty">Chargement…</td></tr></tbody></table></div></div>`;
  let exportRows=[];
  try {
    const [products,purchases]=await Promise.all([getCollection("produits"),getCollection("achats")]);
    const costMap=new Map();
    purchases.forEach(p=>{const kg=Number(p.quantityKg||0),cost=Number(p.costTotal??p.total??0);if(!p.productId||kg<=0||cost<0)return;const v=costMap.get(p.productId)||{kg:0,cost:0};v.kg+=kg;v.cost+=cost;costMap.set(p.productId,v);});
    exportRows=products.map(p=>{const stock=Math.max(0,Number(p.stockKg||0)),buy=costMap.get(p.id),unitCost=buy&&buy.kg>0?buy.cost/buy.kg:null,value=unitCost===null?null:stock*unitCost,threshold=Number(p.stockAlertKg??0);return {name:p.nom||"Produit sans nom",stock,unitCost,value,threshold,status:p.actif===false?"Inactif":stock<=threshold?"Stock faible":"Disponible"};});
    const totalKg=exportRows.reduce((a,r)=>a+r.stock,0),valued=exportRows.reduce((a,r)=>a+(r.value??0),0),missing=exportRows.filter(r=>r.stock>0&&r.unitCost===null).length;
    $("stockValueStats").innerHTML=`<div class="stat"><span>Quantité disponible</span><strong>${formatNumber(totalKg)} kg</strong></div><div class="stat"><span>Valeur estimée valorisée</span><strong>${money(valued)}</strong></div><div class="stat"><span>Produits non valorisés</span><strong>${formatNumber(missing)}</strong></div>`;
    $("stockValueNote").textContent=missing?`${formatNumber(missing)} produit(s) avec stock positif n'ont pas de coût d'achat enregistré : ils sont exclus de la valeur estimée. Le stock initial sans historique d'achat peut donc être sous-évalué.`:"Tous les stocks positifs disposent d'un coût d'achat permettant une estimation. Le calcul reste indicatif et ne constitue pas une valorisation comptable certifiée.";
    $("stockValueRows").innerHTML=exportRows.length?exportRows.map(r=>`<tr><td><strong>${escapeHtml(r.name)}</strong></td><td>${formatNumber(r.stock)} kg</td><td>${r.unitCost===null?"Non disponible":money(r.unitCost.toFixed(2))}</td><td>${r.value===null?"Non valorisée":money(r.value.toFixed(0))}</td><td>${formatNumber(r.threshold)} kg</td><td><span class="badge ${r.status==="Stock faible"?"badge-low":""}">${r.status}</span></td></tr>`).join(""):`<tr><td colspan="6" class="empty">Aucun produit enregistré.</td></tr>`;
    $("stockValueCsv").onclick=()=>{const rows=[["Produit","Stock kg","Coût moyen FCFA/kg","Valeur estimée FCFA","Seuil alerte kg","État"],...exportRows.map(r=>[r.name,r.stock,r.unitCost??"",r.value??"",r.threshold,r.status])];const csv="\uFEFF"+rows.map(row=>row.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(";")).join("\r\n");const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8;"}));const a=document.createElement("a");a.href=url;a.download="etat-stock-valorise.csv";a.click();URL.revokeObjectURL(url);};
    $("stockValuePrint").onclick=()=>window.print();
  } catch(e) { $("stockValueRows").innerHTML=`<tr><td colspan="6" class="empty">Impossible de charger les produits et achats. Vérifie les droits Firestore.</td></tr>`;showToast("Erreur lors du calcul de la valeur du stock."); }
}

async function renderProducts() {
  pageContent.innerHTML = `<div class="panel"><div class="panel-head"><div><h2>Catalogue des produits</h2><div class="section-sub">Prix au kilogramme et au carton • stock en kg</div></div><button id="addProduct" class="primary">+ Ajouter un produit</button></div><div class="table-wrap"><table><thead><tr><th>Produit</th><th>Prix détail / kg</th><th>Prix gros / kg</th><th>Prix détail / carton</th><th>Prix gros / carton</th><th>Poids carton</th><th>Stock (kg)</th><th>Seuil d’alerte (kg)</th><th>État</th><th>Correction stock</th></tr></thead><tbody id="productRows"><tr><td colspan="7" class="empty">Chargement…</td></tr></tbody></table></div></div>`;
  $("addProduct").addEventListener("click", showProductForm);
  try {
    productsCache = await getCollection("produits");
    $("productRows").innerHTML = productsCache.length ? productsCache.map(p=>`<tr><td><strong>${escapeHtml(p.nom||"Sans nom")}</strong><div class="muted">${escapeHtml(p.categorie||"")}</div></td><td>${money(p.prixKilo)}</td><td>${money(p.prixGrosKilo ?? p.prixKilo)}</td><td>${money(p.prixCarton)}</td><td>${money(p.prixGrosCarton ?? p.prixCarton)}</td><td>${formatNumber(p.poidsCarton)} kg</td><td>${formatNumber(p.stockKg)} kg</td><td><div class="threshold-control"><input type="number" min="0" step="0.01" class="stock-threshold-input" aria-label="Seuil d’alerte en kg pour ${escapeHtml(p.nom||"produit")}" value="${Number(p.stockAlertKg??0)}" data-id="${p.id}"><button class="secondary save-threshold" data-id="${p.id}">Enregistrer</button></div></td><td><span class="badge ${p.actif!==false && Number(p.stockKg||0)<=Number(p.stockAlertKg??0)?"badge-low":""}">${p.actif===false?"Inactif":Number(p.stockKg||0)<=Number(p.stockAlertKg??0)?"Stock faible":"Actif"}</span></td><td><button class="secondary stock-adjust-btn" data-id="${p.id}">Ajuster</button></td></tr>`).join("") : `<tr><td colspan="7" class="empty">Aucun produit. Clique sur « Ajouter un produit ».</td></tr>`;
    document.querySelectorAll(".stock-adjust-btn").forEach(btn=>btn.onclick=()=>showStockAdjustment(btn.dataset.id));
    document.querySelectorAll(".save-threshold").forEach(btn=>btn.onclick=async()=>{
      const input=pageContent.querySelector(`.stock-threshold-input[data-id="${btn.dataset.id}"]`);
      const threshold=Number(input?.value);
      if(!input || !Number.isFinite(threshold) || threshold<0){showToast("Saisis un seuil d’alerte valide (0 ou plus).");return;}
      btn.disabled=true;
      try{await updateDoc(doc(db,"produits",btn.dataset.id),{stockAlertKg:threshold});showToast("Seuil d’alerte enregistré.");await renderProducts();}
      catch(err){btn.disabled=false;showToast("Impossible d’enregistrer le seuil. Vérifie les règles Firestore.");}
    });
  } catch(e) { $("productRows").innerHTML=`<tr><td colspan="6" class="empty">Erreur de lecture Firestore. Vérifie la configuration et les règles.</td></tr>`; }
}
async function showStockAdjustment(productId){
  const product=productsCache.find(p=>p.id===productId); if(!product)return;
  const panel=document.createElement("div"); panel.className="panel";
  panel.innerHTML=`${pageHeader("Correction de stock",`Produit : ${escapeHtml(product.nom||"")} • Stock actuel : ${formatNumber(product.stockKg)} kg`)}<form id="stockAdjustmentForm"><div class="form-grid"><div><label>Type de mouvement</label><select name="type" required><option value="perte">Perte</option><option value="casse">Casse / produit détérioré</option><option value="ajustement">Correction d'inventaire</option><option value="retour">Retour en stock</option></select></div><div><label>Quantité (kg)</label><input name="quantity" type="number" min="0.01" step="0.01" required></div><div class="span-2"><label>Motif / commentaire</label><input name="note" maxlength="250" required placeholder="Ex. : carton endommagé, écart d'inventaire…"></div></div><p class="section-sub">Les pertes et casses diminuent le stock. Un retour augmente le stock. Chaque mouvement est enregistré dans l'historique.</p><div class="form-actions"><button type="button" id="cancelStockAdjustment" class="secondary">Annuler</button><button class="primary" type="submit">Enregistrer le mouvement</button></div></form>`;
  pageContent.prepend(panel); $("cancelStockAdjustment").onclick=()=>panel.remove();
  $("stockAdjustmentForm").onsubmit=async(e)=>{e.preventDefault();const f=new FormData(e.currentTarget),qty=Number(f.get("quantity")),type=f.get("type"),delta=type==="retour"?qty:-qty;if(!Number.isFinite(qty)||qty<=0){showToast("Saisis une quantité valide.");return;}try{const productRef=doc(db,"produits",productId),movementRef=doc(collection(db,"mouvements_stock"));await runTransaction(db,async(tx)=>{const snap=await tx.get(productRef);if(!snap.exists())throw new Error("Produit introuvable.");const current=Number(snap.data().stockKg||0),next=current+delta;if(next<0)throw new Error(`Stock insuffisant : ${current} kg disponibles.`);tx.update(productRef,{stockKg:next});tx.set(movementRef,{productId,productName:snap.data().nom||product.nom||"",type,quantityKg:qty,deltaKg:delta,stockBeforeKg:current,stockAfterKg:next,note:String(f.get("note")||"").trim(),createdAt:serverTimestamp(),createdBy:currentUser?.uid||null});});showToast("Mouvement de stock enregistré.");await renderProducts();}catch(err){showToast(err.message||"Impossible d'enregistrer le mouvement. Vérifie les droits Firestore.");}};
}

function showProductForm() {
  const panel = document.createElement("div"); panel.className="panel";
  panel.innerHTML = `${pageHeader("Nouveau produit","Renseigne les tarifs de détail et de gros ainsi que le poids du carton")}<form id="productForm"><div class="form-grid"><div><label>Nom du produit</label><input name="nom" required></div><div><label>Catégorie</label><input name="categorie" placeholder="Poisson congelé"></div><div><label>Prix détail / kg (FCFA)</label><input name="prixKilo" type="number" min="0" step="1" required></div><div><label>Prix gros / kg (FCFA)</label><input name="prixGrosKilo" type="number" min="0" step="1" required></div><div><label>Prix détail / carton (FCFA)</label><input name="prixCarton" type="number" min="0" step="1" required></div><div><label>Prix gros / carton (FCFA)</label><input name="prixGrosCarton" type="number" min="0" step="1" required></div><div><label>Poids du carton (kg)</label><input name="poidsCarton" type="number" min="0.01" step="0.01" required></div><div><label>Stock (kg)</label><input name="stockKg" type="number" min="0" step="0.01" required></div><div><label>Seuil d’alerte de stock (kg)</label><input name="stockAlertKg" type="number" min="0" step="0.01" value="0" required><small class="field-help">Alerte lorsque le stock atteint ce seuil ou passe en dessous.</small></div></div><div class="form-actions"><button type="button" id="cancelProduct" class="secondary">Annuler</button><button class="primary" type="submit">Enregistrer</button></div></form>`;
  pageContent.prepend(panel); $("cancelProduct").onclick=()=>panel.remove();
  $("productForm").onsubmit=async(e)=>{e.preventDefault();const f=new FormData(e.currentTarget);try{await addDoc(collection(db,"produits"),{nom:f.get("nom").trim(),categorie:f.get("categorie").trim(),prixKilo:Number(f.get("prixKilo")),prixGrosKilo:Number(f.get("prixGrosKilo")),prixCarton:Number(f.get("prixCarton")),prixGrosCarton:Number(f.get("prixGrosCarton")),poidsCarton:Number(f.get("poidsCarton")),stockKg:Number(f.get("stockKg")),stockAlertKg:Number(f.get("stockAlertKg")||0),actif:true,createdAt:serverTimestamp()});showToast("Produit enregistré.");await renderProducts();}catch(err){showToast("Enregistrement refusé. Vérifie les règles Firestore.");}};
}
async function renderCustomers() {
  pageContent.innerHTML=`<div class="panel"><div class="panel-head"><div><h2>Répertoire clients</h2><div class="section-sub">Particuliers, restaurants, hôtels et revendeurs</div></div><button id="addCustomer" class="primary">+ Ajouter un client</button></div><div class="table-wrap"><table><thead><tr><th>Nom</th><th>Téléphone</th><th>Type</th><th>Adresse</th><th>État</th></tr></thead><tbody id="customerRows"><tr><td colspan="5" class="empty">Chargement…</td></tr></tbody></table></div></div>`;
  $("addCustomer").onclick=showCustomerForm;
  try{const rows=await getCollection("clients");customersCache=rows;$("customerRows").innerHTML=rows.length?rows.map(c=>`<tr><td><strong>${escapeHtml(c.nom||"")}</strong></td><td>${escapeHtml(c.telephone||"")}</td><td>${escapeHtml(c.typeClient||"")}</td><td>${escapeHtml(c.adresse||"")}</td><td><span class="badge">${c.actif===false?"Inactif":"Actif"}</span></td></tr>`).join(""):`<tr><td colspan="5" class="empty">Aucun client enregistré.</td></tr>`;}catch(e){$("customerRows").innerHTML=`<tr><td colspan="5" class="empty">Impossible de lire les clients.</td></tr>`;}
}
function showCustomerForm(){const p=document.createElement("div");p.className="panel";p.innerHTML=`${pageHeader("Nouveau client")}<form id="customerForm"><div class="form-grid"><div><label>Nom / raison sociale</label><input name="nom" required></div><div><label>Téléphone</label><input name="telephone" required></div><div><label>Type de client</label><select name="typeClient"><option>particulier</option><option>restaurant</option><option>hotel</option><option>revendeur</option></select></div><div><label>Adresse</label><input name="adresse" placeholder="Bamako"></div></div><div class="form-actions"><button type="button" id="cancelCustomer" class="secondary">Annuler</button><button class="primary">Enregistrer</button></div></form>`;pageContent.prepend(p);$("cancelCustomer").onclick=()=>p.remove();$("customerForm").onsubmit=async(e)=>{e.preventDefault();const f=new FormData(e.currentTarget);try{await addDoc(collection(db,"clients"),{nom:f.get("nom").trim(),telephone:f.get("telephone").trim(),typeClient:f.get("typeClient"),adresse:f.get("adresse").trim(),actif:true,createdAt:serverTimestamp()});showToast("Client enregistré.");await renderCustomers();}catch(e){showToast("Enregistrement refusé. Vérifie les règles Firestore.");}};}
function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}


// MODULE VENTES : vente au kg/carton, stock réservé à l'enregistrement et suivi des règlements.
async function renderSales() {
  pageContent.innerHTML = `<div class="panel"><div class="panel-head"><div><h2>Historique des ventes</h2><div class="section-sub">Ventes au détail ou en cartons, avec suivi des crédits et paiements partiels</div></div><button id="newSaleBtn" class="primary">+ Nouvelle vente</button></div><div class="table-wrap"><table><thead><tr><th>Date</th><th>Référence</th><th>Client</th><th>Total</th><th>Payé</th><th>Solde</th><th>Statut</th><th>Action</th></tr></thead><tbody id="salesRows"><tr><td colspan="9" class="empty">Chargement…</td></tr></tbody></table></div></div>`;
  $("newSaleBtn").onclick = showSaleForm;
  try {
    const rows = await getCollection("ventes");
    rows.sort((a,b)=>(recordDate(b.date||b.createdAt)?.getTime()||0)-(recordDate(a.date||a.createdAt)?.getTime()||0));
    $("salesRows").innerHTML = rows.length ? rows.map(s=>{
      const total=Number(s.total||0), paid=Number(s.paidAmount||0), balance=Math.max(0,total-paid);
      const status=balance===0?"Payé":paid>0?"Partiellement payé":"À crédit";
      const date=recordDate(s.date||s.createdAt)?.toLocaleDateString("fr-FR")||"—";
      return `<tr><td>${date}</td><td>${escapeHtml(s.reference||s.id.slice(0,8))}</td><td><strong>${escapeHtml(s.customerName||"Client de passage")}</strong></td><td>${money(total)}</td><td>${money(paid)}</td><td>${money(balance)}</td><td><span class="badge">${status}</span></td><td>${balance>0?`<button class="secondary payment-btn" data-id="${s.id}" data-balance="${balance}">Encaisser</button>`:"—"}</td></tr>`;
    }).join(""):`<tr><td colspan="8" class="empty">Aucune vente enregistrée pour le moment.</td></tr>`;
    document.querySelectorAll(".payment-btn").forEach(b=>b.onclick=()=>showPaymentForm(b.dataset.id,Number(b.dataset.balance)));
  } catch(e) { $("salesRows").innerHTML=`<tr><td colspan="8" class="empty">Impossible de charger les ventes. Vérifie les règles Firestore.</td></tr>`; }
}
async function showSaleForm(){
  try { productsCache=await getCollection("produits"); customersCache=await getCollection("clients"); }
  catch(e){showToast("Impossible de charger produits ou clients.");return;}
  const available=productsCache.filter(p=>p.actif!==false);
  if(!available.length){showToast("Aucun produit actif disponible.");return;}
  const panel=document.createElement("div");panel.className="panel";
  const productOptions=()=>available.map(p=>`<option value="${p.id}">${escapeHtml(p.nom)} — stock ${formatNumber(p.stockKg)} kg</option>`).join("");
  panel.innerHTML=`${pageHeader("Nouvelle vente","Ajoute plusieurs produits à une même vente. Le stock sera déduit à l'enregistrement.")}<form id="saleForm">
  <div class="form-grid">
  <div><label>Date de vente</label><input name="saleDate" id="saleDate" type="date" value="${localDateInput()}" required></div>
  <div><label>Client</label><select name="clientId" id="saleClient"><option value="">Client de passage</option>${customersCache.map(c=>`<option value="${c.id}">${escapeHtml(c.nom||"Client")} — ${escapeHtml(c.telephone||"")}</option>`).join("")}</select></div>
  <div><label>Nom client de passage (facultatif)</label><input name="walkinName" placeholder="Nom du client"></div>
  <div><label>Tarif appliqué</label><select name="priceTier" id="salePriceTier"><option value="detail">Détail — particulier</option><option value="gros">Gros — professionnel</option></select><small class="field-help">Le tarif professionnel est proposé automatiquement pour restaurant, hôtel ou revendeur. Tu peux le modifier.</small></div>
  <div class="span-2"><div class="panel-head"><strong>Articles de la vente</strong><button type="button" id="addSaleLine" class="secondary">+ Ajouter un produit</button></div><div id="saleLines"></div></div>
  <div><label>Total vente (FCFA)</label><input id="saleTotal" readonly></div>
  <div><label>Montant payé maintenant (FCFA)</label><input id="salePaid" name="paid" type="number" min="0" step="1" value="0" required></div>
  <div><label>Moyen de paiement initial</label><select name="paymentMethod"><option>Espèces</option><option>Orange Money</option><option>Moov Money</option><option>Virement</option></select></div>
  <div class="span-2"><label>Note (facultatif)</label><input name="note" placeholder="Échéance ou remarque"></div>
  </div><p id="saleSummary" class="section-sub"></p>
  <div class="form-actions"><button type="button" id="cancelSale" class="secondary">Annuler</button><button class="primary" type="submit">Enregistrer la vente</button></div></form>`;
  pageContent.prepend(panel);
  const lines=$("saleLines"),total=$("saleTotal"),paid=$("salePaid"),summary=$("saleSummary");
  function addLine(){const row=document.createElement("div");row.className="form-grid sale-line";row.style.cssText="border:1px solid #dfe7e1;border-radius:8px;padding:12px;margin:10px 0;";row.innerHTML=`<div class="span-2"><label>Produit</label><select class="line-product">${productOptions()}</select></div><div><label>Unité</label><select class="line-unit"><option value="kg">Kilogramme (kg)</option><option value="carton">Carton</option></select></div><div><label>Quantité</label><input class="line-qty" type="number" min="0.01" step="0.01" value="1" required></div><div><label>Prix unitaire (FCFA)</label><input class="line-price" type="number" min="0" step="1" required></div><div><label>Montant ligne</label><input class="line-total" readonly></div><div class="span-2"><button type="button" class="secondary remove-line">Retirer cet article</button></div>`;lines.append(row);const prod=row.querySelector('.line-product'),unit=row.querySelector('.line-unit'),qty=row.querySelector('.line-qty'),price=row.querySelector('.line-price');function syncPrice(){const item=available.find(x=>x.id===prod.value),tier=$('salePriceTier').value==='gros';price.value=item?(unit.value==='carton'?Number(tier?(item.prixGrosCarton??item.prixCarton??0):(item.prixCarton||0)):Number(tier?(item.prixGrosKilo??item.prixKilo??0):(item.prixKilo||0))):0;recalc();}prod.onchange=syncPrice;unit.onchange=syncPrice;qty.oninput=recalc;price.oninput=recalc;row.querySelector('.remove-line').onclick=()=>{if(lines.children.length>1)row.remove();recalc();};syncPrice();}
  function readLines(){return [...lines.querySelectorAll('.sale-line')].map(row=>{const prod=available.find(x=>x.id===row.querySelector('.line-product').value),unit=row.querySelector('.line-unit').value,quantity=Number(row.querySelector('.line-qty').value),unitPrice=Number(row.querySelector('.line-price').value),quantityKg=unit==='carton'?quantity*Number(prod?.poidsCarton||0):quantity;return {product:prod,productId:prod?.id,productName:prod?.nom,unit,quantity,quantityKg,unitPrice,total:Math.round(quantity*unitPrice)};});}
  function recalc(){const amount=readLines().reduce((sum,x)=>sum+x.total,0);total.value=amount;summary.textContent=`Solde après paiement : ${money(Math.max(0,amount-Number(paid.value||0)))}`;paid.max=amount;}
  $("addSaleLine").onclick=addLine;$("salePriceTier").onchange=()=>lines.querySelectorAll(".sale-line").forEach(row=>row.querySelector(".line-product").dispatchEvent(new Event("change")));$("saleClient").onchange=()=>{const c=customersCache.find(x=>x.id===$("saleClient").value);$("salePriceTier").value=["restaurant","hotel","hotel","revendeur"].includes(String(c?.typeClient||"").toLowerCase())?"gros":"detail";$("salePriceTier").dispatchEvent(new Event("change"));};paid.oninput=recalc;$("cancelSale").onclick=()=>panel.remove();addLine();
  $("saleForm").onsubmit=async(e)=>{e.preventDefault();const f=new FormData(e.currentTarget),items=readLines(),amount=items.reduce((sum,x)=>sum+x.total,0),paidValue=Number(f.get('paid')||0);if(items.some(x=>!x.product||!Number.isFinite(x.quantity)||x.quantity<=0||!Number.isFinite(x.unitPrice)||x.unitPrice<0||x.quantityKg<=0)||paidValue<0||paidValue>amount){showToast("Vérifie les produits, quantités, prix et montant payé.");return;}const saleRef=doc(collection(db,"ventes")),refs=[...new Set(items.map(x=>x.productId))].map(id=>({id,ref:doc(db,"produits",id)}));try{await runTransaction(db,async(tx)=>{const snapshots=[];for(const entry of refs)snapshots.push(await tx.get(entry.ref));const stocks=new Map();snapshots.forEach((snap,i)=>{if(!snap.exists())throw new Error("Un produit est introuvable.");stocks.set(refs[i].id,Number(snap.data().stockKg||0));});const required=new Map();items.forEach(x=>required.set(x.productId,(required.get(x.productId)||0)+x.quantityKg));for(const [id,kg] of required){const stock=stocks.get(id);if(kg>stock)throw new Error(`Stock insuffisant pour ${available.find(p=>p.id===id)?.nom||'un produit'} : ${stock} kg disponibles.`);}const invoiceYear=new Date().getFullYear(),counterRef=doc(db,"counters",`invoice-${invoiceYear}`),counterSnap=await tx.get(counterRef),nextInvoice=Number(counterSnap.exists()?counterSnap.data().lastNumber||0:0)+1,invoiceNumber=`FFM-${invoiceYear}-${String(nextInvoice).padStart(6,"0")}`;const now=new Date().toISOString(),paymentMethod=f.get('paymentMethod');const invoiceItems=items.map(x=>({productId:x.productId,nom:x.productName,quantite:x.quantity,unite:x.unit,quantityKg:x.quantityKg,prixUnitaire:x.unitPrice,total:x.total}));const first=items[0];const saleData={reference:"V-"+Date.now().toString().slice(-8),invoiceNumber,customerId:f.get('clientId')||null,customerName:customersCache.find(c=>c.id===f.get('clientId'))?.nom||f.get('walkinName').trim()||"Client de passage",items:invoiceItems,productId:first.productId,productName:first.productName,unit:first.unit,quantity:first.quantity,quantityKg:first.quantityKg,unitPrice:first.unitPrice,total:amount,paidAmount:paidValue,balance:amount-paidValue,paymentStatus:paidValue===amount?"paid":paidValue>0?"partial":"credit",priceTier:f.get("priceTier")||"detail",date:f.get("saleDate")||localDateInput(),paymentHistory:paidValue>0?[{amount:paidValue,method:paymentMethod,date:now}]:[],note:f.get('note').trim(),createdAt:serverTimestamp(),createdBy:currentUser?.uid||null};tx.set(saleRef,saleData);tx.set(counterRef,{year:invoiceYear,lastNumber:nextInvoice,updatedAt:serverTimestamp()});for(const [id,kg] of required)tx.update(doc(db,"produits",id),{stockKg:stocks.get(id)-kg});if(paidValue>0){const payRef=doc(collection(db,"paiements"));tx.set(payRef,{saleId:saleRef.id,amount:paidValue,method:paymentMethod,type:"sale",createdAt:serverTimestamp()});}});showToast("Vente multi-produits enregistrée et stocks mis à jour.");await renderSales();}catch(err){showToast(err.message||"Échec d'enregistrement. Vérifie les règles Firestore.");}};
}
async function showPaymentForm(saleId,balance){
  const amount=prompt(`Solde à régler : ${money(balance)}\nSaisis le montant reçu :`,"");
  if(amount===null)return;const value=Number(amount);
  if(!Number.isFinite(value)||value<=0||value>balance){showToast("Montant de paiement invalide.");return;}
  const method=prompt("Moyen de paiement : Espèces, Orange Money, Moov Money ou Virement","Espèces")||"Espèces";
  const saleRef=doc(db,"ventes",saleId),payRef=doc(collection(db,"paiements"));
  try{await runTransaction(db,async(tx)=>{const snap=await tx.get(saleRef);if(!snap.exists())throw new Error("Vente introuvable.");const sale=snap.data();const due=Math.max(0,Number(sale.total||0)-Number(sale.paidAmount||0));if(value>due)throw new Error("Le montant dépasse le solde restant.");const paid=Number(sale.paidAmount||0)+value;tx.update(saleRef,{paidAmount:paid,balance:Number(sale.total||0)-paid,paymentStatus:paid>=Number(sale.total||0)?"paid":"partial",paymentHistory:[...(sale.paymentHistory||[]),{amount:value,method,date:new Date().toISOString()}]});tx.set(payRef,{saleId,amount:value,method,type:"sale",createdAt:serverTimestamp()});});showToast("Paiement enregistré.");await renderSales();}catch(e){showToast(e.message||"Paiement impossible.");}
}


// MODULE CLIENTS DEBITEURS : agrégation des soldes encore dus depuis les ventes.
async function renderDebtors() {
  pageContent.innerHTML = `<div class="stats" id="debtorStats">
    <div class="stat"><span>Clients avec reliquat</span><strong>…</strong></div>
    <div class="stat"><span>Montant restant à encaisser</span><strong>…</strong></div>
    <div class="stat"><span>Ventes à crédit / partielles</span><strong>…</strong></div>
    <div class="stat"><span>Total déjà encaissé sur ces ventes</span><strong>…</strong></div>
  </div>
  <div class="panel"><div class="panel-head"><div><h2>Suivi des clients débiteurs</h2><div class="section-sub">Les reliquats sont calculés à partir des ventes enregistrées.</div></div>
  <div class="toolbar"><input id="debtorSearch" placeholder="Rechercher un client ou téléphone"></div></div>
  <div class="table-wrap"><table><thead><tr><th>Client</th><th>Téléphone</th><th>Montant des ventes</th><th>Déjà payé</th><th>Reliquat</th><th>Dernière vente</th><th>Détail</th></tr></thead><tbody id="debtorRows"><tr><td colspan="7" class="empty">Chargement…</td></tr></tbody></table></div>
  </div><div id="debtorDetails"></div>`;

  try {
    const [sales, customers] = await Promise.all([getCollection("ventes"), getCollection("clients")]);
    const customerMap = new Map(customers.map(c => [c.id, c]));
    const groups = new Map();
    sales.forEach(sale => {
      const total = Number(sale.total || sale.montantTotal || sale.totalFCFA || 0);
      const paid = Math.min(total, Math.max(0, Number(sale.paidAmount || sale.montantPaye || sale.paye || sale.totalPaye || 0)));
      const due = Math.max(0, total - paid);
      if (due <= 0) return;
      const customer = customerMap.get(sale.customerId) || {};
      const name = sale.customerName || sale.clientNom || sale.nomClient || customer.nom || "Client de passage";
      const phone = sale.telephoneClient || customer.telephone || "";
      const groupKey = sale.customerId ? `id:${sale.customerId}` : `name:${String(name).trim().toLocaleLowerCase("fr")}|${String(phone).replace(/\D/g,"")}`;
      const created = sale.createdAt?.toDate ? sale.createdAt.toDate() : (sale.createdAt?.seconds ? new Date(sale.createdAt.seconds*1000) : (sale.date?.toDate ? sale.date.toDate() : null));
      if (!groups.has(groupKey)) groups.set(groupKey,{key:groupKey,name,phone,total:0,paid:0,due:0,sales:[],lastDate:null});
      const g=groups.get(groupKey);
      g.total+=total; g.paid+=paid; g.due+=due; g.sales.push({...sale,_due:due,_paid:paid,_total:total,_date:created});
      if(created && (!g.lastDate || created>g.lastDate)) g.lastDate=created;
    });
    const debtors=[...groups.values()].sort((a,b)=>b.due-a.due);
    const debtTotal=debtors.reduce((sum,g)=>sum+g.due,0);
    const paidTotal=debtors.reduce((sum,g)=>sum+g.paid,0);
    const salesCount=debtors.reduce((sum,g)=>sum+g.sales.length,0);
    $("debtorStats").innerHTML=`<div class="stat"><span>Clients avec reliquat</span><strong>${debtors.length}</strong></div>
      <div class="stat"><span>Montant restant à encaisser</span><strong>${money(debtTotal)}</strong></div>
      <div class="stat"><span>Ventes à crédit / partielles</span><strong>${salesCount}</strong></div>
      <div class="stat"><span>Total déjà encaissé sur ces ventes</span><strong>${money(paidTotal)}</strong></div>`;

    const renderRows=(term="")=>{
      const filtered=debtors.filter(g=>(g.name+" "+g.phone).toLocaleLowerCase("fr").includes(term.toLocaleLowerCase("fr")));
      $("debtorRows").innerHTML=filtered.length?filtered.map(g=>`<tr>
        <td><strong>${escapeHtml(g.name)}</strong></td><td>${escapeHtml(g.phone||"—")}</td>
        <td>${money(g.total)}</td><td>${money(g.paid)}</td><td><strong>${money(g.due)}</strong></td>
        <td>${g.lastDate?g.lastDate.toLocaleDateString("fr-FR"):"—"}</td>
        <td><button class="secondary debtor-detail-btn" data-key="${escapeHtml(g.key)}">Voir détail</button></td></tr>`).join("")
        :`<tr><td colspan="7" class="empty">${term?"Aucun résultat pour cette recherche.":"Aucun client débiteur : tous les paiements sont à jour."}</td></tr>`;
      document.querySelectorAll(".debtor-detail-btn").forEach(btn=>btn.onclick=()=>{
        const g=debtors.find(x=>x.key===btn.dataset.key); if(!g)return;
        $("debtorDetails").innerHTML=`<div class="panel"><div class="panel-head"><div><h2>Détail du compte — ${escapeHtml(g.name)}</h2><div class="section-sub">Reliquat global : <strong>${money(g.due)}</strong></div></div><button class="secondary" id="closeDebtorDetails">Fermer</button></div>
        <div class="table-wrap"><table><thead><tr><th>Référence</th><th>Date</th><th>Produit</th><th>Total vente</th><th>Payé</th><th>Reliquat</th><th>Historique des versements</th></tr></thead><tbody>
        ${g.sales.map(s=>{const hist=Array.isArray(s.paymentHistory)?s.paymentHistory:[];const history=hist.length?hist.map(p=>`${p.date?new Date(p.date).toLocaleDateString("fr-FR"):"date inconnue"} — ${money(p.amount)} (${escapeHtml(p.method||"mode non précisé")})`).join("<br>"):"Historique détaillé non disponible";const d=s._date?s._date.toLocaleDateString("fr-FR"):"—";return `<tr><td>${escapeHtml(s.reference||s.id.slice(0,8))}</td><td>${d}</td><td>${escapeHtml(s.productName||"Article")}</td><td>${money(s._total)}</td><td>${money(s._paid)}</td><td><strong>${money(s._due)}</strong></td><td>${history}</td></tr>`;}).join("")}
        </tbody></table></div></div>`;
        $("closeDebtorDetails").onclick=()=>{$("debtorDetails").innerHTML="";};
      });
    };
    renderRows();
    $("debtorSearch").addEventListener("input",e=>renderRows(e.target.value.trim()));
  } catch(err) {
    $("debtorRows").innerHTML=`<tr><td colspan="7" class="empty">Impossible de charger les comptes débiteurs. Vérifie les règles Firestore.</td></tr>`;
    showToast("Erreur de lecture des ventes ou clients.");
  }
}


// MODULE ACHATS : achats fournisseurs et entrée de stock.
async function renderPurchases() {
  pageContent.innerHTML = `<div class="stats" id="purchaseStats">
    <div class="stat"><span>Achats enregistrés</span><strong>…</strong></div>
    <div class="stat"><span>Montant total des achats</span><strong>…</strong></div>
    <div class="stat"><span>Déjà payé</span><strong>…</strong></div>
    <div class="stat"><span>Reliquat fournisseurs</span><strong>…</strong></div>
  </div>
  <div class="panel"><div class="panel-head"><div><h2>Historique des achats</h2><div class="section-sub">Les quantités achetées sont ajoutées au stock du produit.</div></div><button id="newPurchaseBtn" class="primary">+ Nouvel achat</button></div>
  <div class="table-wrap"><table><thead><tr><th>Date</th><th>Référence</th><th>Fournisseur</th><th>Produit</th><th>Quantité</th><th>Total</th><th>Payé</th><th>Reliquat</th><th>Action</th></tr></thead><tbody id="purchaseRows"><tr><td colspan="9" class="empty">Chargement…</td></tr></tbody></table></div></div>
  <div id="purchaseHistoryBackdrop" class="purchase-history-backdrop hidden"></div>
  <aside id="purchaseHistorySidebar" class="purchase-history-sidebar" aria-hidden="true"></aside>`;
  $("newPurchaseBtn").onclick = showPurchaseForm;
  try {
    const rows = await getCollection("achats");
    rows.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
    const total = rows.reduce((sum,r)=>sum+Number(r.total||0),0);
    const paid = rows.reduce((sum,r)=>sum+Number(r.paidAmount||0),0);
    const due = rows.reduce((sum,r)=>sum+Math.max(0,Number(r.total||0)-Number(r.paidAmount||0)),0);
    $("purchaseStats").innerHTML = `<div class="stat"><span>Achats enregistrés</span><strong>${formatNumber(rows.length)}</strong></div>
      <div class="stat"><span>Montant total des achats</span><strong>${money(total)}</strong></div>
      <div class="stat"><span>Déjà payé</span><strong>${money(paid)}</strong></div>
      <div class="stat"><span>Reliquat fournisseurs</span><strong>${money(due)}</strong></div>`;
    $("purchaseRows").innerHTML = rows.length ? rows.map(r=>{
      const date=r.createdAt?.seconds?new Date(r.createdAt.seconds*1000).toLocaleDateString("fr-FR"):"—";
      const balance=Math.max(0,Number(r.total||0)-Number(r.paidAmount||0));
      return `<tr><td>${date}</td><td>${escapeHtml(r.reference||r.id.slice(0,8))}</td><td>${escapeHtml(r.supplierName||"—")}</td><td>${escapeHtml(r.productName||"—")}</td><td>${formatNumber(r.quantity)} ${escapeHtml(r.unit||"kg")}</td><td>${money(r.total)}</td><td>${money(r.paidAmount)}</td><td><strong>${money(balance)}</strong></td><td><button class="secondary purchase-history-btn" data-id="${r.id}">Historique</button>${balance>0?` <button class="secondary purchase-payment-btn" data-id="${r.id}">Ajouter un paiement</button>`:""}</td></tr>`;
    }).join("") : `<tr><td colspan="9" class="empty">Aucun achat enregistré.</td></tr>`;
    document.querySelectorAll(".purchase-payment-btn").forEach(btn => { btn.onclick = () => addPurchasePayment(btn.dataset.id); });
    document.querySelectorAll(".purchase-history-btn").forEach(btn => { btn.onclick = () => showPurchasePaymentHistory(rows.find(r => r.id === btn.dataset.id)); });
    $("purchaseHistoryBackdrop").onclick = closePurchasePaymentHistory;
  } catch(e) {
    $("purchaseRows").innerHTML=`<tr><td colspan="9" class="empty">Impossible de lire les achats. Vérifie les règles Firestore.</td></tr>`;
  }
}
function showPurchasePaymentHistory(purchase) {
  if (!purchase) return;
  const sidebar = $("purchaseHistorySidebar");
  const history = Array.isArray(purchase.paymentHistory) ? purchase.paymentHistory : [];
  const balance = Math.max(0, Number(purchase.total || 0) - Number(purchase.paidAmount || 0));
  const items = history.length ? history.map((p, i) => {
    const date = p.date ? new Date(p.date).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" }) : "Date inconnue";
    return `<div class="purchase-payment-entry"><div><strong>${money(p.amount)}</strong><span>${escapeHtml(p.method || "Moyen non précisé")}</span></div><time>${date}</time></div>`;
  }).join("") : `<div class="empty">Aucun paiement enregistré pour cet achat.</div>`;
  sidebar.innerHTML = `<div class="purchase-history-head"><div><span class="section-sub">ACHAT ${escapeHtml(purchase.reference || purchase.id.slice(0,8))}</span><h2>Historique des paiements</h2></div><button class="secondary purchase-history-close" aria-label="Fermer">✕</button></div>
    <div class="purchase-history-summary"><span>Fournisseur</span><strong>${escapeHtml(purchase.supplierName || "—")}</strong><span>Total achat</span><strong>${money(purchase.total)}</strong><span>Total payé</span><strong>${money(purchase.paidAmount)}</strong><span>Reliquat</span><strong>${money(balance)}</strong></div>
    <div class="purchase-history-list">${items}</div>
    ${balance > 0 ? `<button class="primary purchase-history-add">Ajouter un paiement</button>` : `<div class="badge">Achat entièrement payé</div>`}`;
  sidebar.classList.add("open");
  sidebar.setAttribute("aria-hidden", "false");
  $("purchaseHistoryBackdrop").classList.remove("hidden");
  sidebar.querySelector(".purchase-history-close").onclick = closePurchasePaymentHistory;
  const addBtn = sidebar.querySelector(".purchase-history-add");
  if (addBtn) addBtn.onclick = () => addPurchasePayment(purchase.id);
}
function closePurchasePaymentHistory() {
  const sidebar = $("purchaseHistorySidebar");
  if (sidebar) { sidebar.classList.remove("open"); sidebar.setAttribute("aria-hidden", "true"); }
  const backdrop = $("purchaseHistoryBackdrop");
  if (backdrop) backdrop.classList.add("hidden");
}

async function addPurchasePayment(purchaseId) {
  try {
    const purchases = await getCollection("achats");
    const purchase = purchases.find(p => p.id === purchaseId);
    if (!purchase) { showToast("Achat introuvable."); return; }
    const due = Math.max(0, Number(purchase.total || 0) - Number(purchase.paidAmount || 0));
    if (due <= 0) { showToast("Cet achat est déjà entièrement payé."); return; }
    const rawAmount = prompt(`Reliquat : ${money(due)}\nMontant du paiement (FCFA) :`, String(due));
    if (rawAmount === null) return;
    const amount = Number(rawAmount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > due) { showToast("Saisis un montant positif qui ne dépasse pas le reliquat."); return; }
    const method = prompt("Moyen de paiement (Espèces, Orange Money, Moov Money, Virement) :", "Espèces");
    if (method === null) return;
    const purchaseRef = doc(db, "achats", purchaseId);
    const paymentRef = doc(collection(db, "paiements"));
    await runTransaction(db, async tx => {
      const snap = await tx.get(purchaseRef);
      if (!snap.exists()) throw new Error("Achat introuvable.");
      const data = snap.data();
      const currentDue = Math.max(0, Number(data.total || 0) - Number(data.paidAmount || 0));
      if (amount > currentDue || currentDue <= 0) throw new Error("Le reliquat a changé. Actualise la liste et réessaie.");
      const paidAmount = Number(data.paidAmount || 0) + amount;
      const balance = Math.max(0, Number(data.total || 0) - paidAmount);
      const history = Array.isArray(data.paymentHistory) ? data.paymentHistory : [];
      const payment = { amount, method: method.trim() || "Non précisé", date: new Date().toISOString() };
      tx.update(purchaseRef, { paidAmount, balance, paymentStatus: balance === 0 ? "paid" : "partial", paymentHistory: [...history, payment] });
      tx.set(paymentRef, { purchaseId, amount, method: payment.method, type: "purchase", createdAt: serverTimestamp() });
    });
    showToast("Paiement fournisseur enregistré.");
    await renderPurchases();
    const refreshed = (await getCollection("achats")).find(p => p.id === purchaseId);
    if (refreshed) showPurchasePaymentHistory(refreshed);
  } catch (e) { showToast(e.message || "Impossible d'enregistrer le paiement."); }
}

async function showPurchaseForm() {
  try { productsCache = await getCollection("produits"); }
  catch(e) { showToast("Impossible de charger les produits."); return; }
  const available=productsCache.filter(p=>p.actif!==false);
  if(!available.length){showToast("Ajoute d'abord un produit actif.");return;}
  const panel=document.createElement("div");panel.className="panel";
  panel.innerHTML=`${pageHeader("Nouvel achat fournisseur","L'achat augmente le stock. Le paiement peut être partiel ou différé.")}<form id="purchaseForm">
  <div class="form-grid">
    <div><label>Fournisseur / vendeur</label><input name="supplierName" required placeholder="Nom du fournisseur"></div>
    <div><label>Produit acheté</label><select name="productId" id="purchaseProduct" required>${available.map(p=>`<option value="${p.id}">${escapeHtml(p.nom||"Produit")} — stock actuel ${formatNumber(p.stockKg)} kg</option>`).join("")}</select></div>
    <div><label>Unité d'achat</label><select name="unit" id="purchaseUnit"><option value="kg">Kilogramme (kg)</option><option value="carton">Carton</option></select></div>
    <div><label>Quantité achetée</label><input name="quantity" id="purchaseQty" type="number" min="0.01" step="0.01" value="1" required></div>
    <div><label>Prix d'achat unitaire (FCFA)</label><input name="unitPrice" id="purchasePrice" type="number" min="0" step="1" required></div>
    <div><label>Total achat fournisseur (FCFA)</label><input id="purchaseTotal" readonly></div>
    <div><label>Frais d’approche du lot (FCFA)</label><input name="fraisApproche" id="purchaseFees" type="number" min="0" step="1" value="0"><small class="field-help">Transport, transit, douane, déchargement… intégrés au coût du stock.</small></div>
    <div><label>Montant payé maintenant (FCFA)</label><input name="paid" id="purchasePaid" type="number" min="0" step="1" value="0" required></div>
    <div><label>Moyen de paiement</label><select name="paymentMethod"><option>Espèces</option><option>Orange Money</option><option>Moov Money</option><option>Virement</option></select></div>
    <div class="span-2"><label>Note (facultatif)</label><input name="note" placeholder="Référence fournisseur, qualité, remarque…"></div>
  </div><p id="purchaseSummary" class="section-sub"></p>
  <div class="form-actions"><button type="button" id="cancelPurchase" class="secondary">Annuler</button><button class="primary" type="submit">Enregistrer l'achat</button></div></form>`;
  pageContent.prepend(panel);
  const productSel=$("purchaseProduct"),unit=$("purchaseUnit"),qty=$("purchaseQty"),price=$("purchasePrice"),total=$("purchaseTotal"),fees=$("purchaseFees"),paid=$("purchasePaid"),summary=$("purchaseSummary");
  function syncPrice(){const p=available.find(x=>x.id===productSel.value);price.value=p?(unit.value==="carton"?Number(p.prixCarton||0):Number(p.prixKilo||0)):"";syncTotal();}
  function syncTotal(){const amount=Math.round(Number(price.value||0)*Number(qty.value||0));total.value=amount;summary.textContent=`Coût complet du lot : ${money(amount+Number(fees.value||0))} • Reliquat fournisseur : ${money(Math.max(0,amount-Number(paid.value||0)))}`;paid.max=amount;}
  productSel.onchange=syncPrice;unit.onchange=syncPrice;qty.oninput=syncTotal;price.oninput=syncTotal;fees.oninput=syncTotal;paid.oninput=syncTotal;
  $("cancelPurchase").onclick=()=>panel.remove();syncPrice();
  $("purchaseForm").onsubmit=async(e)=>{
    e.preventDefault();const f=new FormData(e.currentTarget);const product=available.find(p=>p.id===f.get("productId"));
    const quantity=Number(f.get("quantity")),unitValue=f.get("unit"),unitPrice=Number(f.get("unitPrice")),amount=Math.round(quantity*unitPrice),fraisApproche=Math.round(Number(f.get("fraisApproche")||0)),costTotal=amount+fraisApproche,paidAmount=Number(f.get("paid")||0);
    const quantityKg=unitValue==="carton"?quantity*Number(product?.poidsCarton||0):quantity;
    if(!product||quantity<=0||unitPrice<0||paidAmount<0||paidAmount>amount||quantityKg<=0){showToast("Vérifie les quantités et les montants.");return;}
    const purchaseRef=doc(collection(db,"achats")),productRef=doc(db,"produits",product.id);
    try{
      await runTransaction(db,async(tx)=>{
        const productSnap=await tx.get(productRef);if(!productSnap.exists())throw new Error("Produit introuvable.");
        const stock=Number(productSnap.data().stockKg||0);
        const paymentHistory=paidAmount>0?[{amount:paidAmount,method:f.get("paymentMethod"),date:new Date().toISOString()}]:[];
        tx.set(purchaseRef,{reference:"A-"+Date.now().toString().slice(-8),supplierName:f.get("supplierName").trim(),productId:product.id,productName:product.nom,unit:unitValue,quantity,quantityKg,unitPrice,total:amount,fraisApproche,costTotal,paidAmount,balance:amount-paidAmount,paymentStatus:paidAmount>=amount?"paid":paidAmount>0?"partial":"credit",paymentHistory,note:f.get("note").trim(),createdAt:serverTimestamp(),createdBy:currentUser?.uid||null});
        tx.update(productRef,{stockKg:stock+quantityKg});
        if(paidAmount>0){const paymentRef=doc(collection(db,"paiements"));tx.set(paymentRef,{purchaseId:purchaseRef.id,amount:paidAmount,method:f.get("paymentMethod"),type:"purchase",createdAt:serverTimestamp()});}
      });
      showToast("Achat enregistré et stock augmenté.");await renderPurchases();
    }catch(err){showToast(err.message||"Échec de l'enregistrement de l'achat.");}
  };
}

// MODULE FACTURES : facture imprimable, enregistrable en PDF depuis une vente.
async function renderInvoices() {
  pageContent.innerHTML = `<div class="panel"><div class="panel-head"><div><h2>Factures</h2><div class="section-sub">Choisis une vente enregistrée pour afficher ou enregistrer sa facture en PDF.</div></div></div><div class="table-wrap"><table><thead><tr><th>Référence</th><th>Client</th><th>Date</th><th>Total</th><th>Payé</th><th>Solde dû</th><th>Action</th></tr></thead><tbody id="invoiceRows"><tr><td colspan="7" class="empty">Chargement des ventes…</td></tr></tbody></table></div></div>`;
  try {
    const [sales, customers] = await Promise.all([getCollection("ventes"), getCollection("clients")]);
    const customerMap = new Map(customers.map(c => [c.id, c]));
    const rows = sales.map((s, i) => {
      const ref = s.invoiceNumber || s.reference || s.numero || s.venteNo || s.id;
      const customer = customerMap.get(s.customerId) || {};
      const clientName = s.customerName || s.clientNom || s.nomClient || customer.nom || "Client de passage";
      const total = Number(s.total || s.montantTotal || s.totalFCFA || 0);
      const paid = Number(s.paidAmount || s.montantPaye || s.paye || s.totalPaye || 0);
      const due = Math.max(0, total - paid);
      const dateVal = recordDate(s.date || s.createdAt);
      const date = dateVal ? dateVal.toLocaleDateString("fr-FR") : "—";
      return `<tr><td>${escapeHtml(ref)}</td><td>${escapeHtml(clientName)}</td><td>${date}</td><td>${money(total)}</td><td>${money(paid)}</td><td>${money(due)}</td><td><button class="primary invoice-open" data-id="${escapeHtml(s.id)}">Facture PDF</button></td></tr>`;
    }).join("");
    $("invoiceRows").innerHTML = rows || `<tr><td colspan="7" class="empty">Aucune vente disponible pour générer une facture.</td></tr>`;
    document.querySelectorAll(".invoice-open").forEach(btn => btn.addEventListener("click", () => {
      const sale = sales.find(s => s.id === btn.dataset.id);
      const customer = customerMap.get(sale?.customerId) || {};
      printSaleInvoice(sale, customer);
    }));
  } catch (e) {
    $("invoiceRows").innerHTML = `<tr><td colspan="7" class="empty">Impossible de charger les ventes. Vérifie les règles Firestore.</td></tr>`;
  }
}
function printSaleInvoice(sale, customer) {
  if (!sale) return;
  const ref = sale.invoiceNumber || sale.reference || sale.numero || sale.venteNo || sale.id;
  const name = sale.customerName || sale.clientNom || sale.nomClient || customer.nom || "Client de passage";
  const phone = sale.telephoneClient || customer.telephone || "";
  const items = Array.isArray(sale.items) ? sale.items : (Array.isArray(sale.lignes) ? sale.lignes : [{nom: sale.productName || "Article", quantite: sale.quantity || 0, unite: sale.unit || "kg", prixUnitaire: sale.unitPrice || 0, total: sale.total || 0}]);
  const total = Number(sale.total || sale.montantTotal || sale.totalFCFA || 0);
  const paid = Number(sale.paidAmount || sale.montantPaye || sale.paye || sale.totalPaye || 0);
  const due = Math.max(0, total - paid);
  const paymentHistory = Array.isArray(sale.paymentHistory) ? sale.paymentHistory : [];
  let runningPaid = 0;
  const paymentRows = paymentHistory.length ? paymentHistory.map((payment, index) => {
    const amount = Number(payment.amount || 0);
    runningPaid += amount;
    const remaining = Math.max(0, total - runningPaid);
    const paymentDate = payment.date ? new Date(payment.date) : null;
    const paymentDateText = paymentDate && !Number.isNaN(paymentDate.getTime()) ? paymentDate.toLocaleDateString("fr-FR") : "—";
    const method = payment.method || "—";
    return `<tr><td>${formatNumber(index + 1)}</td><td>${paymentDateText}</td><td>${escapeHtml(method)}</td><td>${money(amount)}</td><td>${money(remaining)}</td></tr>`;
  }).join("") : `<tr><td colspan="5">Aucun détail de versement enregistré.</td></tr>`;
  const dateObj = recordDate(sale.date || sale.createdAt) || new Date();
  const date = dateObj.toLocaleDateString("fr-FR");
  const itemRows = items.length ? items.map(item => {
    const label = item.nom || item.produitNom || item.produit || "Article";
    const qty = Number(item.quantite || item.qte || item.quantity || 0);
    const unit = item.unite || item.unit || "kg";
    const price = Number(item.prixUnitaire || item.prix || item.prixKilo || 0);
    const lineTotal = Number(item.total || item.montant || qty * price || 0);
    return `<tr><td>${escapeHtml(label)}</td><td>${formatNumber(qty)} ${escapeHtml(unit)}</td><td>${money(price)}</td><td>${money(lineTotal)}</td></tr>`;
  }).join("") : `<tr><td colspan="4">Détails des articles non disponibles dans l’enregistrement de cette vente.</td></tr>`;
  const doc = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Facture ${escapeHtml(ref)}</title><style>
  body{font-family:Arial,sans-serif;color:#17221e;margin:36px}header{display:flex;justify-content:space-between;border-bottom:3px solid #176b4d;padding-bottom:18px}h1{color:#176b4d;margin:0}small{color:#65756c}.meta{margin:24px 0;display:flex;justify-content:space-between}.box{background:#f3f7f4;padding:14px;border-radius:8px}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{padding:12px;border-bottom:1px solid #dfe7e1;text-align:left}th{background:#edf4ef}.totals{margin:24px 0 0 auto;width:300px}.totals div{display:flex;justify-content:space-between;padding:7px}.grand{font-size:18px;font-weight:bold;border-top:2px solid #176b4d}.section-title{margin:28px 0 0;color:#176b4d}.note{margin-top:36px;color:#65756c;font-size:12px}@media print{button{display:none}body{margin:15mm}}</style></head><body>
  <header><div><h1>FRESH FISH MALI</h1><small>Facture de vente</small></div><div><strong>FACTURE ${escapeHtml(ref)}</strong><br><small>Date : ${date}</small></div></header>
  <div class="meta"><div class="box"><strong>Facturé à</strong><br>${escapeHtml(name)}<br>${escapeHtml(phone)}</div><div class="box"><strong>Statut de paiement</strong><br>${due===0?"Payé":paid>0?"Partiellement payé":"À crédit"}</div></div>
  <table><thead><tr><th>Article</th><th>Quantité</th><th>Prix unitaire</th><th>Montant</th></tr></thead><tbody>${itemRows}</tbody></table>
  <h3 class="section-title">Historique des paiements et reliquats</h3>
  <table><thead><tr><th>N°</th><th>Date</th><th>Mode de paiement</th><th>Versement</th><th>Reliquat après paiement</th></tr></thead><tbody>${paymentRows}</tbody></table>
  <div class="totals"><div><span>Total facture</span><strong>${money(total)}</strong></div><div><span>Total versé</span><strong>${money(paid)}</strong></div><div class="grand"><span>Reliquat à payer</span><strong>${money(due)}</strong></div></div>
  <p class="note">Merci pour votre confiance. Document généré depuis Fresh Fish Mali CRM.</p><button onclick="window.print()">Imprimer / Enregistrer en PDF</button><script>window.onload=()=>window.print();</script></body></html>`;
  const w = window.open("", "_blank");
  if (!w) { showToast("Autorise les fenêtres pop-up pour générer la facture."); return; }
  w.document.open(); w.document.write(doc); w.document.close();
}


// MODULE TRESORERIE : mouvements réellement encaissés/décaissés selon les historiques de versements.
async function renderTreasury() {
  pageContent.innerHTML = `<div class="panel">
    <div class="panel-head"><div><h2>Trésorerie</h2><div class="section-sub">Flux de paiements réellement enregistrés sur les ventes et achats.</div></div>
      <div class="toolbar"><label for="cashPeriod">Période</label><select id="cashPeriod"><option value="all">Toute période</option><option value="today">Aujourd'hui</option><option value="week">Cette semaine</option><option value="month" selected>Ce mois</option></select></div>
    </div>
    <form id="cashOpeningForm" class="toolbar" style="margin:12px 0;gap:8px;align-items:end"><div><label for="cashOpening">Solde d’ouverture (FCFA)</label><input id="cashOpening" type="number" min="0" step="1" value="0" required></div><button class="secondary" type="submit">Enregistrer le solde initial</button><small id="cashOpeningNote" class="field-help">Solde de départ de la trésorerie, avant les mouvements enregistrés.</small></form>
    <div class="stats" id="cashStats"><div class="stat"><span>Encaissements</span><strong>…</strong></div><div class="stat"><span>Décaissements</span><strong>…</strong></div><div class="stat"><span>Solde net</span><strong>…</strong></div><div class="stat"><span>Mouvements</span><strong>…</strong></div></div><div class="stats" id="cashMethodStats"><div class="stat"><span>Espèces</span><strong>…</strong></div><div class="stat"><span>Orange Money</span><strong>…</strong></div><div class="stat"><span>Moov Money</span><strong>…</strong></div></div>
    <div class="table-wrap"><table><thead><tr><th>Date</th><th>Opération</th><th>Référence</th><th>Tiers</th><th>Moyen</th><th>Montant</th></tr></thead><tbody id="cashRows"><tr><td colspan="6" class="empty">Chargement…</td></tr></tbody></table></div>
  </div>`;
  try {
    const [sales, purchases, expenses, payments, stockMovements] = await Promise.all([getCollection("ventes"), getCollection("achats"), getCollection("depenses"), getCollection("paiements"), getCollection("mouvements_stock")]);
    const openingRef=doc(db,"parametres","tresorerie"); let openingBalance=0; try{const openingSnap=await getDoc(openingRef);if(openingSnap.exists())openingBalance=Math.max(0,Number(openingSnap.data().openingBalance||0));}catch(e){console.warn("Solde d’ouverture non accessible",e);}
    $("cashOpening").value=openingBalance;
    $("cashOpeningForm").onsubmit=async(e)=>{e.preventDefault();const value=Number($("cashOpening").value);if(!Number.isFinite(value)||value<0){showToast("Saisis un solde d’ouverture valide.");return;}try{await setDoc(openingRef,{openingBalance:value,updatedAt:serverTimestamp(),updatedBy:currentUser?.uid||null},{merge:true});openingBalance=value;showToast("Solde d’ouverture enregistré.");update();}catch(err){showToast("Impossible d’enregistrer le solde d’ouverture. Vérifie les règles Firestore.");}};
    const movements = []; 
    const dateOf = value => {
      if (!value) return null;
      const d = value?.toDate ? value.toDate() : value?.seconds ? new Date(value.seconds*1000) : new Date(value);
      return Number.isNaN(d.getTime()) ? null : d;
    };
    // Source principale des flux financiers : collection paiements.
    // Les historiques embarqués ne servent de repli que pour les opérations anciennes
    // sans aucun document de paiement associé, afin d'éviter les doublons.
    const paidSaleIds = new Set();
    const paidPurchaseIds = new Set();
    payments.forEach(payment => {
      const amount = Number(payment.amount || 0);
      if (!Number.isFinite(amount) || amount <= 0) return;
      const date = dateOf(payment.createdAt) || dateOf(payment.date);
      const isSale = payment.type === "sale" || Boolean(payment.saleId);
      const isPurchase = payment.type === "purchase" || Boolean(payment.purchaseId);
      if (isSale && payment.saleId) paidSaleIds.add(payment.saleId);
      if (isPurchase && payment.purchaseId) paidPurchaseIds.add(payment.purchaseId);
      if (isSale) {
        const sale = sales.find(item => item.id === payment.saleId);
        movements.push({date,type:"Encaissement vente",ref:sale?.reference||sale?.invoiceNumber||String(payment.saleId||"").slice(0,8)||"Vente",third:sale?.customerName||"Client de passage",method:payment.method||"—",amount,direction:"in"});
      } else if (isPurchase) {
        const purchase = purchases.find(item => item.id === payment.purchaseId);
        movements.push({date,type:"Paiement achat",ref:purchase?.reference||String(payment.purchaseId||"").slice(0,8)||"Achat",third:purchase?.supplierName||"Fournisseur",method:payment.method||"—",amount,direction:"out"});
      }
    });
    sales.filter(s => !paidSaleIds.has(s.id)).forEach(s => (Array.isArray(s.paymentHistory)?s.paymentHistory:[]).forEach(p => {
      const date=dateOf(p.date)||dateOf(s.createdAt);
      movements.push({date,type:"Encaissement vente (historique ancien)",ref:s.reference||s.id.slice(0,8),third:s.customerName||"Client de passage",method:p.method||"—",amount:Number(p.amount||0),direction:"in"});
    }));
    purchases.filter(pur => !paidPurchaseIds.has(pur.id)).forEach(pur => (Array.isArray(pur.paymentHistory)?pur.paymentHistory:[]).forEach(p => {
      const date=dateOf(p.date)||dateOf(pur.createdAt);
      movements.push({date,type:"Paiement achat (historique ancien)",ref:pur.reference||pur.id.slice(0,8),third:pur.supplierName||"Fournisseur",method:p.method||"—",amount:Number(p.amount||0),direction:"out"});
    }));
    expenses.forEach(expense => {
      const date=dateOf(expense.date)||dateOf(expense.createdAt);
      movements.push({date,type:"Dépense",ref:expense.category||"Autre",third:expense.description||"Dépense",method:expense.paymentMethod||"—",amount:Number(expense.amount||0),direction:"out"});
    });
    const filtered = () => {
      const now=new Date(), period=$("cashPeriod").value;
      const start=new Date(now); start.setHours(0,0,0,0);
      if(period==="week"){const day=(start.getDay()+6)%7;start.setDate(start.getDate()-day);}
      if(period==="month"){start.setDate(1);}
      return movements.filter(m=>m.date && (period==="all" || m.date>=start) && m.date<=now).sort((a,b)=>b.date-a.date);
    };
    const update=()=>{
      // Les encaissements/décaissements affichés suivent le filtre choisi.
      // Le solde courant, lui, doit intégrer tous les mouvements depuis le solde d'ouverture.
      const rows=filtered(), incoming=rows.filter(m=>m.direction==="in").reduce((s,m)=>s+m.amount,0), outgoing=rows.filter(m=>m.direction==="out").reduce((s,m)=>s+m.amount,0);
      const allIncoming=movements.filter(m=>m.date && m.direction==="in").reduce((s,m)=>s+m.amount,0);
      const allOutgoing=movements.filter(m=>m.date && m.direction==="out").reduce((s,m)=>s+m.amount,0);
      const currentBalance=openingBalance+allIncoming-allOutgoing;
      $("cashStats").innerHTML=`<div class="stat"><span>Encaissements (période)</span><strong>${money(incoming)}</strong></div><div class="stat"><span>Décaissements (période)</span><strong>${money(outgoing)}</strong></div><div class="stat"><span>Solde courant (tous mouvements + ouverture)</span><strong>${money(currentBalance)}</strong></div><div class="stat"><span>Mouvements (période)</span><strong>${formatNumber(rows.length)}</strong></div>`;
      const methodTotals={"Espèces":0,"Orange Money":0,"Moov Money":0}; rows.forEach(m=>{const key=Object.keys(methodTotals).find(k=>String(m.method).toLowerCase().includes(k.toLowerCase()));if(key)methodTotals[key]+=(m.direction==="in"?1:-1)*m.amount;}); $("cashMethodStats").innerHTML=Object.entries(methodTotals).map(([method,total])=>`<div class="stat"><span>${method} — solde net (période)</span><strong>${money(total)}</strong></div>`).join("");
      $("cashRows").innerHTML=rows.length?rows.map(m=>`<tr><td>${m.date}</td><td><span class="badge">${escapeHtml(m.type)}</span></td><td>${escapeHtml(m.ref)}</td><td>${escapeHtml(m.third)}</td><td>${escapeHtml(m.method)}</td><td><strong>${m.direction==="in"?"+":"−"} ${money(m.amount)}</strong></td></tr>`).join(""):`<tr><td colspan="6" class="empty">Aucun mouvement pour cette période.</td></tr>`;
    };
    $("cashPeriod").onchange=update; update();
  } catch(err) {
    $("cashRows").innerHTML=`<tr><td colspan="6" class="empty">Impossible de charger les paiements. Vérifie les règles Firestore.</td></tr>`;
    showToast("Erreur de lecture des mouvements de trésorerie.");
  }
}


// TRI UNIVERSEL DES TABLEAUX : clic sur un en-tête pour alterner croissant/décroissant.
pageContent.addEventListener("click", (event) => {
  const th = event.target.closest("th");
  if (!th || !pageContent.contains(th)) return;
  const table = th.closest("table");
  if (!table) return;
  const headerRow = th.closest("tr");
  const columnIndex = Array.from(headerRow.children).indexOf(th);
  if (columnIndex < 0) return;
  const tbody = table.tBodies[0];
  if (!tbody) return;

  const headers = Array.from(headerRow.children);
  headers.forEach(header => {
    header.removeAttribute("aria-sort");
    header.classList.remove("sort-ascending", "sort-descending");
  });
  const direction = th.dataset.sortDirection === "ascending" ? "descending" : "ascending";
  th.dataset.sortDirection = direction;
  th.setAttribute("aria-sort", direction);
  th.classList.add(direction === "ascending" ? "sort-ascending" : "sort-descending");

  const parseDate = (value) => {
    const match = value.trim().match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/);
    if (!match) return null;
    let year = Number(match[3]);
    if (year < 100) year += 2000;
    return new Date(year, Number(match[2])-1, Number(match[1]), Number(match[4]||0), Number(match[5]||0)).getTime();
  };
  const parseNumber = (value) => {
    const normalized = value.replace(/\s/g, "").replace(/[−–]/g, "-").replace(/[^\d,.-]/g, "").replace(",", ".");
    if (!normalized || !/^-?\d+(?:\.\d+)?$/.test(normalized)) return null;
    const number = Number(normalized);
    return Number.isFinite(number) ? number : null;
  };
  const rows = Array.from(tbody.rows).filter(row => !row.querySelector(".empty") && row.cells.length > columnIndex);
  if (rows.length < 2) return;

  rows.sort((rowA, rowB) => {
    const a = (rowA.cells[columnIndex].innerText || rowA.cells[columnIndex].textContent || "").trim();
    const b = (rowB.cells[columnIndex].innerText || rowB.cells[columnIndex].textContent || "").trim();
    const dateA = parseDate(a), dateB = parseDate(b);
    let comparison;
    if (dateA !== null && dateB !== null) comparison = dateA - dateB;
    else {
      const numA = parseNumber(a), numB = parseNumber(b);
      if (numA !== null && numB !== null) comparison = numA - numB;
      else comparison = a.localeCompare(b, "fr", { numeric: true, sensitivity: "base" });
    }
    return direction === "ascending" ? comparison : -comparison;
  });
  rows.forEach(row => tbody.appendChild(row));
});
