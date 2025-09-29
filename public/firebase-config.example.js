// Copy this file to firebase-config.js and fill in your own Firebase project values
window.firebaseConfig = {
  apiKey: "YOUR_PUBLIC_API_KEY",
  authDomain: "yourapp.firebaseapp.com",
  projectId: "yourapp",
  storageBucket: "yourapp.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:xxxxxxxxxxxx",
};

  // Initialize (compat)
  const app = firebase.initializeApp(firebaseConfig);

  // Use the emulator locally
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    try {
      firebase.auth().useEmulator(`http://${location.hostname}:9099`);
      console.debug("[auth] Using Auth Emulator");
    } catch (e) {
      console.warn("[auth] emulator attach failed", e);
    }
  }

  // expose if you ever need it
  window._fbApp = app;
})();
