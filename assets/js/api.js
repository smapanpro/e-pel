/*
 * =============================================================
 *  E-PEL SMAPAN - KLIEN API BACKEND
 *  Backend : Google Apps Script (Code.gs)
 *  URL diambil dari script.txt (hasil deploy Web App /exec)
 *
 *  Semua request ke Apps Script lewat file ini agar konsisten:
 *  - POST memakai Content-Type text/plain untuk menghindari preflight CORS
 *  - Timeout otomatis (AbortController) + pembersihan BOM
 *  - Sesi login (token) disimpan di localStorage
 * =============================================================
 */
(function () {
  "use strict";

  var API_URL =
    "https://script.google.com/macros/s/AKfycbyMQXgISwkWN8hmXueY_2rDgwObNababMxe7j3XPTKcpuXUgYQ4Qzg-QPLJ9Z3nfwUnnw/exec";

  var SESSION_KEY = "epel-session";
  var TIMEOUT_MS = 25000;

  function readSession(store) {
    try {
      var session = JSON.parse(store.getItem(SESSION_KEY) || "null");
      if (!session || !session.token) {
        return null;
      }
      if (session.expiresAt && Date.now() > session.expiresAt) {
        store.removeItem(SESSION_KEY);
        return null;
      }
      return session;
    } catch (error) {
      return null;
    }
  }

  function getSession() {
    return (
      readSession(window.localStorage) || readSession(window.sessionStorage)
    );
  }

  function saveSession(session, remember) {
    var store =
      remember === false ? window.sessionStorage : window.localStorage;
    try {
      clearSession();
      store.setItem(SESSION_KEY, JSON.stringify(session));
    } catch (error) {
      /* Penyimpanan tidak tersedia (mode privat / penuh). */
    }
  }

  function clearSession() {
    try {
      window.localStorage.removeItem(SESSION_KEY);
    } catch (error) {
      /* abaikan */
    }
    try {
      window.sessionStorage.removeItem(SESSION_KEY);
    } catch (error) {
      /* abaikan */
    }
  }

  function buildUrl(params) {
    var parts = [];
    Object.keys(params || {}).forEach(function (key) {
      var value = params[key];
      if (value === undefined || value === null || value === "") {
        return;
      }
      parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(value));
    });
    return parts.length ? API_URL + "?" + parts.join("&") : API_URL;
  }

  function send(url, options) {
    options = options || {};

    var controller =
      typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = null;

    if (controller) {
      options.signal = controller.signal;
      timer = window.setTimeout(function () {
        controller.abort();
      }, TIMEOUT_MS);
    }

    return fetch(url, options)
      .then(function (response) {
        if (timer) {
          window.clearTimeout(timer);
        }
        return response.text();
      })
      .then(function (text) {
        text = String(text || "").replace(/^\uFEFF/, "");
        if (!text) {
          throw new Error("Respons server kosong.");
        }
        try {
          return JSON.parse(text);
        } catch (error) {
          throw new Error("Respons server tidak valid.");
        }
      })
      .catch(function (error) {
        if (timer) {
          window.clearTimeout(timer);
        }
        if (error && error.name === "AbortError") {
          throw new Error("Server tidak merespons. Periksa koneksi lalu coba lagi.");
        }
        throw error;
      });
  }

  function get(params) {
    return send(buildUrl(params), { method: "GET" });
  }

  function post(payload) {
    return send(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload || {}),
    });
  }

  function unwrap(response) {
    if (!response || response.success !== true) {
      throw new Error((response && response.message) || "Permintaan gagal.");
    }
    return response.data;
  }

  window.EPEL = {
    url: API_URL,
    get: get,
    post: post,
    unwrap: unwrap,
    getSession: getSession,
    saveSession: saveSession,
    clearSession: clearSession,
  };
})();
