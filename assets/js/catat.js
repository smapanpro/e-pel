(function () {
  "use strict";

  var api = window.EPEL;

  var form = document.getElementById("violation-form");
  var typeSelect = document.getElementById("violation-type");
  var pointsInput = document.getElementById("violation-points");
  var dateInput = document.getElementById("violation-date");
  var nameInput = document.getElementById("student-name");
  var nisInput = document.getElementById("student-nisn");
  var classInput = document.getElementById("student-class");
  var noteInput = document.getElementById("violation-note");
  var submitButton = form ? form.querySelector('button[type="submit"]') : null;
  var alertBox = document.getElementById("success-alert");
  var alertMessage = document.getElementById("success-message");
  var summaryPoints = document.getElementById("summary-points");
  var summaryStudent = document.getElementById("summary-student");
  var summaryType = document.getElementById("summary-type");
  var stepItems = document.querySelectorAll(".steps__item");
  var alertTimer = null;

  var requiredFields = [nameInput, nisInput, classInput, dateInput, typeSelect];
  var metadataLoaded = false;

  function setToday() {
    var now = new Date();
    var local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    dateInput.value = local.toISOString().slice(0, 10);
  }

  function getSelectedOption() {
    return typeSelect.options[typeSelect.selectedIndex];
  }

  function updatePoints() {
    var option = getSelectedOption();
    var points = option ? option.getAttribute("data-points") : "";
    pointsInput.value = points ? points + " Poin" : "-";
  }

  function updateSummary() {
    var option = getSelectedOption();
    var points = option ? option.getAttribute("data-points") : "";

    summaryPoints.textContent = points || "0";
    summaryType.textContent = points
      ? option.textContent.trim()
      : "Belum ada jenis pelanggaran";
    summaryStudent.textContent = nameInput.value.trim() || "Belum ada siswa";
  }

  function studentDataComplete() {
    return (
      nameInput.value.trim() !== "" &&
      nisInput.value.trim() !== "" &&
      classInput.value.trim() !== ""
    );
  }

  function updateSteps() {
    if (!stepItems.length) {
      return;
    }

    var activeIndex = 0;

    if (studentDataComplete()) {
      var option = getSelectedOption();
      activeIndex = option && option.getAttribute("data-points") ? 2 : 1;
    }

    for (var i = 0; i < stepItems.length; i += 1) {
      stepItems[i].classList.toggle("is-active", i === activeIndex);
    }
  }

  function clearInvalid(field) {
    var wrapper = field.closest(".form-field");
    if (wrapper) {
      wrapper.classList.remove("is-invalid");
    }
  }

  function validate() {
    var firstInvalid = null;

    requiredFields.forEach(function (field) {
      var valid = field.value.trim() !== "";
      var wrapper = field.closest(".form-field");

      if (wrapper) {
        wrapper.classList.toggle("is-invalid", !valid);
      }

      if (!valid && !firstInvalid) {
        firstInvalid = field;
      }
    });

    if (firstInvalid) {
      firstInvalid.focus();
      return false;
    }

    return true;
  }

  function showAlert(message, isError) {
    alertMessage.textContent = message;
    alertBox.classList.toggle("alert--error", !!isError);
    alertBox.classList.add("is-visible");

    window.clearTimeout(alertTimer);
    alertTimer = window.setTimeout(function () {
      alertBox.classList.remove("is-visible");
    }, 6000);
  }

  function fillJenis(list) {
    typeSelect.innerHTML = "";

    var placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Pilih jenis pelanggaran";
    placeholder.disabled = true;
    placeholder.selected = true;
    typeSelect.appendChild(placeholder);

    list.forEach(function (item) {
      var option = document.createElement("option");
      option.value = item.jenis;
      option.textContent = item.jenis;
      option.setAttribute("data-points", String(item.poin));
      typeSelect.appendChild(option);
    });

    updatePoints();
    updateSummary();
    updateSteps();
  }

  var defaultKelas = [
    "X.1", "X.2", "X.3", "X.4", "X.5", "X.6", "X.7", "X.8", "X.9", "X.10",
    "XI SAINSTEK 1", "XI SAINSTEK 2",
    "XI BIOSAINS 1", "XI BIOSAINS 2", "XI BIOSAINS 3",
    "XI SOSHUM 1", "XI SOSHUM 2", "XI SOSHUM 3", "XI SOSHUM 4", "XI SOSHUM 5",
    "XII SAINSTEK 1", "XII SAINSTEK 2",
    "XII BIOSAINS 1", "XII BIOSAINS 2", "XII BIOSAINS 3",
    "XII SOSHUM 1", "XII SOSHUM 2", "XII SOSHUM 3", "XII SOSHUM 4"
  ];

  function fillKelas(list) {
    if (!classInput || classInput.tagName !== "SELECT") {
      return;
    }
    var current = classInput.value;
    var items = Array.isArray(list) && list.length ? list : defaultKelas.map(function (n) { return { nama: n }; });
    classInput.innerHTML = "";

    var placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Pilih kelas";
    placeholder.disabled = true;
    placeholder.selected = true;
    classInput.appendChild(placeholder);

    items.forEach(function (item) {
      var nama = item && (item.nama || item.kelas || item.NamaKelas || item["Nama Kelas"] || item);
      if (!nama) {
        return;
      }
      var option = document.createElement("option");
      option.value = String(nama);
      option.textContent = String(nama);
      classInput.appendChild(option);
    });

    if (current) {
      classInput.value = current;
    }
    if (!classInput.value) {
      classInput.selectedIndex = 0;
    }
  }

  function loadMetadata() {
    if (metadataLoaded || !api) {
      return;
    }
    metadataLoaded = true;

    api
      .get({ action: "jenis" })
      .then(function (response) {
        var list = api.unwrap(response);
        if (Array.isArray(list) && list.length) {
          fillJenis(list);
        }
      })
      .catch(function () {
        /* Opsi jenis bawaan tetap dipakai bila gagal memuat. */
      });

    /* Gunakan daftar kelas yang ditentukan; abaikan data lama dari sheet. */
    fillKelas(defaultKelas);
  }

  if (!form || !typeSelect || !pointsInput || !dateInput) {
    return;
  }

  setToday();
  updatePoints();
  updateSummary();
  updateSteps();
  fillKelas([]);
  loadMetadata();

  typeSelect.addEventListener("change", function () {
    updatePoints();
    updateSummary();
    updateSteps();
    clearInvalid(typeSelect);
  });

  nameInput.addEventListener("input", function () {
    updateSummary();
    updateSteps();
  });

  nisInput.addEventListener("input", updateSteps);
  classInput.addEventListener("change", updateSteps);

  function expandSelect(select) {
    if (!select || select.options.length <= 1) {
      return;
    }
    select.size = 2;
  }

  function collapseSelect(select) {
    if (!select) {
      return;
    }
    select.size = 1;
  }

  classInput.addEventListener("focus", function () {
    expandSelect(classInput);
  });
  classInput.addEventListener("mousedown", function () {
    expandSelect(classInput);
  });
  classInput.addEventListener("blur", function () {
    collapseSelect(classInput);
  });
  classInput.addEventListener("change", function () {
    collapseSelect(classInput);
  });

  requiredFields.forEach(function (field) {
    field.addEventListener("input", function () {
      clearInvalid(field);
    });
    field.addEventListener("change", function () {
      clearInvalid(field);
    });
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();

    if (!validate()) {
      return;
    }

    var selectedOption = getSelectedOption();
    var jenis = typeSelect.value || (selectedOption ? selectedOption.textContent.trim() : "");

    var nisn = nisInput.value.trim();
    var payload = {
      action: "simpanPelanggaran",
      nisn: nisn,
      nis: nisn,
      nama: nameInput.value.trim(),
      kelas: classInput.value.trim(),
      tanggal: dateInput.value,
      jenis: jenis,
      keterangan: noteInput.value.trim(),
    };

    if (api && typeof api.getSession === "function") {
      var session = api.getSession();
      if (session && session.token) {
        payload.token = session.token;
      }
    }

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.classList.add("is-loading");
      submitButton.textContent = "Menyimpan...";
    }

    if (!api) {
      showAlert("Koneksi ke server tidak tersedia.", true);
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.classList.remove("is-loading");
        submitButton.textContent = "Simpan Pelanggaran";
      }
      return;
    }

    api
      .post(payload)
      .then(function (response) {
        if (!response || response.success !== true) {
          throw new Error(
            (response && response.message) || "Gagal menyimpan pelanggaran."
          );
        }

        var data = response.data || {};
        showAlert(
          "Pelanggaran " +
            payload.nama +
            " (" +
            (data.poin || 0) +
            " poin) berhasil dicatat. Total poin siswa saat ini: " +
            (data.totalPoinSiswa || 0) +
            "."
        );

        form.reset();
        setToday();
        updatePoints();
        updateSummary();
        updateSteps();
        nameInput.focus();
      })
      .catch(function (error) {
        showAlert(error.message || "Gagal menyimpan pelanggaran.", true);
      })
      .then(function () {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.classList.remove("is-loading");
          submitButton.textContent = "Simpan Pelanggaran";
        }
      });
  });
})();
