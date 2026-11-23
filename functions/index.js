const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const { defineString } = require("firebase-functions/params");
const { HttpsError, onCall } = require("firebase-functions/v2/https");

initializeApp();

const adminEmails = defineString("CRM_ADMIN_EMAILS", {
  default: "adlas.digitalmali@gmail.com",
});

exports.deleteSellerAccount = onCall(async (request) => {
  const callerEmail = String(request.auth?.token?.email || "").toLowerCase();
  const allowedEmails = adminEmails.value().split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
  if (!request.auth || !allowedEmails.includes(callerEmail)) {
    throw new HttpsError("permission-denied", "Administrator access required.");
  }

  const sellerUid = String(request.data?.sellerUid || "").trim();
  if (!sellerUid || sellerUid === request.auth.uid) {
    throw new HttpsError("invalid-argument", "A valid seller account is required.");
  }

  const profileRef = getFirestore().collection("utilisateurs").doc(sellerUid);
  const profile = await profileRef.get();
  if (!profile.exists || profile.data()?.role !== "vendeur") {
    throw new HttpsError("not-found", "Seller account not found.");
  }

  try {
    await getAuth().deleteUser(sellerUid);
  } catch (error) {
    if (error.code !== "auth/user-not-found") throw error;
  }
  await profileRef.delete();
  return { deleted: true };
});
