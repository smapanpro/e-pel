/**
 * ============================================================
 * E-PEL SMAPAN - Backend Google Apps Script
 * Elektronik Pencatatan Pelanggaran Siswa - SMA Negeri 1 Paiton
 * ============================================================
 *
 * CARA PASANG
 * 1. Buat Google Spreadsheet baru, beri nama misalnya "E-PEL SMAPAN".
 * 2. Menu Extensions > Apps Script, lalu tempel seluruh isi file ini.
 * 3. Jalankan fungsi setupDatabase() satu kali dan izinkan akses.
 * 4. Deploy > New deployment > Web app:
 *      - Execute as        : Me
 *      - Who has access    : Anyone
 *    Salin URL yang berakhiran /exec untuk dipakai frontend.
 * 5. Setiap kali Code.gs diubah, buat versi baru pada Manage deployments.
 *
 * STRUKTUR SHEET (dibuat otomatis)
 *   - Pelanggaran : data pelanggaran siswa
 *   - Kelas       : master kelas (Nama Kelas, Tingkat)
 *
 * CONTOH REQUEST (POST, body JSON atau x-www-form-urlencoded)
 *   { "action": "simpanPelanggaran", "nisn": "12345",
 *     "nama": "Ahmad Rizky Pratama", "kelas": "XII IPA 1",
 *     "tanggal": "2026-11-19", "jenis": "Membolos",
 *     "keterangan": "Tidak hadir pada jam pelajaran" }
 *   { "action": "tambahKelas", "nama": "XII IPA 4", "tingkat": "XII" }
 *
 * CONTOH REQUEST GET
 *   ?action=ping
 *   ?action=kelas
 *   ?action=jenis
 *   ?action=pelanggaran&nisn=12345&limit=20
 *   ?action=riwayat&nisn=12345
 *   Tambahkan &callback=namaFungsi untuk JSONP.
 */

var SPREADSHEET_ID = ''; // Kosongkan bila script terikat pada spreadsheet.
var APP_TIMEZONE = 'Asia/Jakarta';

var SHEET_PELANGGARAN = 'Pelanggaran';
var SHEET_KELAS = 'Kelas';

var HEADERS = {
  PELANGGARAN: [
    'ID Pelanggaran',
    'Waktu Input',
    'Tanggal Kejadian',
    'NISN',
    'Nama Siswa',
    'Kelas',
    'Jenis Pelanggaran',
    'Poin',
    'Keterangan',
    'Dicatat Oleh'
  ],
  KELAS: ['Nama Kelas', 'Tingkat']
};

var VIOLATION_POINTS = {
  'Terlambat Masuk Sekolah': 5,
  'Tidak Memakai Atribut Lengkap': 5,
  'Tidak Mengikuti Pelajaran': 10,
  'Membolos': 10,
  'Memakai Gadget Saat KBM': 15,a
  'Berkata Kasar / Tidak Sopan': 15,
  'Merokok di Lingkungan Sekolah': 25,
  'Berkelahi': 50
};

var DEFAULT_KELAS = [
  'X.1', 'X.2', 'X.3', 'X.4', 'X.5', 'X.6', 'X.7', 'X.8', 'X.9', 'X.10',
  'XI SAINSTEK 1', 'XI SAINSTEK 2',
  'XI BIOSAINS 1', 'XI BIOSAINS 2', 'XI BIOSAINS 3',
  'XI SOSHUM 1', 'XI SOSHUM 2', 'XI SOSHUM 3', 'XI SOSHUM 4', 'XI SOSHUM 5',
  'XII SAINSTEK 1', 'XII SAINSTEK 2',
  'XII BIOSAINS 1', 'XII BIOSAINS 2', 'XII BIOSAINS 3',
  'XII SOSHUM 1', 'XII SOSHUM 2', 'XII SOSHUM 3', 'XII SOSHUM 4'
];

var VALIDASI_KELAS = true; // Tolak kelas yang tidak terdaftar di sheet Kelas.

/* ================================================================
 *  SETUP
 * ================================================================ */

function setupDatabase() {
  var ss = getSpreadsheet_();

  setupSheet_(ss, SHEET_PELANGGARAN, HEADERS.PELANGGARAN);
  setupSheet_(ss, SHEET_KELAS, HEADERS.KELAS);

  seedKelas_(ss);

  return {
    success: true,
    message: 'Database E-PEL SMAPAN siap digunakan.',
    spreadsheetUrl: ss.getUrl(),
    sheets: [SHEET_PELANGGARAN, SHEET_KELAS]
  };
}

function setSpreadsheetId(id) {
  PropertiesService.getScriptProperties().setProperty('EPEL_SPREADSHEET_ID', String(id || '').trim());
}

function getSpreadsheet_() {
  if (SPREADSHEET_ID) {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  }

  var active = null;
  try {
    active = SpreadsheetApp.getActiveSpreadsheet();
  } catch (err) {
    active = null;
  }

  if (active) {
    return active;
  }

  var savedId = PropertiesService.getScriptProperties().getProperty('EPEL_SPREADSHEET_ID');
  if (savedId) {
    return SpreadsheetApp.openById(savedId);
  }

  throw new Error(
    'Spreadsheet belum dikonfigurasi. Jalankan setSpreadsheetId("ID_SPREADSHEET") ' +
    'atau tempel script ini pada spreadsheet melalui Extensions > Apps Script.'
  );
}

function setupSheet_(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }

  if (name === SHEET_KELAS) {
    migrateKelasLayout_(sheet);
  }

  var currentHeader = sheet.getLastRow() >= 1
    ? sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0]
    : [];

  var needsHeader = true;
  if (currentHeader.length >= headers.length) {
    needsHeader = false;
    for (var i = 0; i < headers.length; i += 1) {
      if (String(currentHeader[i]).trim() !== headers[i]) {
        needsHeader = true;
        break;
      }
    }
  }

  if (needsHeader) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setFontColor('#FFFFFF')
      .setBackground('#061B3A')
      .setVerticalAlignment('middle');

    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, headers.length);
  }

  return sheet;
}

function migrateKelasLayout_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 1) {
    return;
  }

  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var oldHeader = values[0].map(function (h) {
    return String(h).trim();
  });

  if (oldHeader.length === 2 && oldHeader[0] === 'Nama Kelas' && oldHeader[1] === 'Tingkat') {
    return;
  }

  var idxNama = oldHeader.indexOf('Nama Kelas');
  var idxTingkat = oldHeader.indexOf('Tingkat');
  var rows = [];

  for (var i = 1; i < values.length; i += 1) {
    var nama = idxNama >= 0 ? String(values[i][idxNama] == null ? '' : values[i][idxNama]).trim() : '';
    if (!nama) {
      continue;
    }
    var tingkat = idxTingkat >= 0 ? String(values[i][idxTingkat] == null ? '' : values[i][idxTingkat]).trim() : '';
    if (!tingkat) {
      tingkat = nama.split(' ')[0] || '';
    }
    rows.push([nama, tingkat]);
  }

  sheet.clear();

  if (rows.length) {
    sheet.getRange(2, 1, rows.length, 2).setValues(rows);
  }
}

function seedKelas_(ss) {
  var sheet = setupSheet_(ss, SHEET_KELAS, HEADERS.KELAS);
  if (sheet.getLastRow() >= 2) {
    return;
  }

  var rows = DEFAULT_KELAS.map(function (nama) {
    var parts = String(nama).split(' ');
    var tingkat = parts[0] || '';
    return [nama, tingkat];
  });

  if (rows.length) {
    sheet.getRange(2, 1, rows.length, HEADERS.KELAS.length).setValues(rows);
  }
}



/* ================================================================
 *  HTTP ENTRY POINT
 * ================================================================ */

function doGet(e) {
  var params = (e && e.parameter) || {};
  var callback = params.callback || '';
  try {
    var action = String(params.action || 'ping').toLowerCase();

    switch (action) {
      case 'ping':
        return respond_(ok_({ status: 'ok', waktu: nowTimestamp_() }), callback);
      case 'kelas':
        return respond_(ok_(listKelas_()), callback);
      case 'jenis':
        return respond_(ok_(listJenisPelanggaran_()), callback);
      case 'pelanggaran':
        return respond_(getPelanggaran_(params), callback);
      case 'riwayat':
        return respond_(getRiwayatSiswa_(params), callback);

      default:
        return respond_(fail_('Aksi GET tidak dikenal: ' + action), callback);
    }
  } catch (err) {
    console.error(err);
    return respond_(fail_('Kesalahan server: ' + errorMessage_(err)), callback);
  }
}

function doPost(e) {
  var body = parseBody_(e);
  var callback = body.callback || '';
  try {
    var action = String(body.action || '').toLowerCase();

    switch (action) {

      case 'simpanpelanggaran':
      case 'simpan_pelanggaran':
        return respond_(simpanPelanggaran_(body), callback);
      case 'tambahkelas':
      case 'tambah_kelas':
        return respond_(tambahKelas_(body), callback);
      default:
        return respond_(fail_('Aksi POST tidak dikenal: ' + action), callback);
    }
  } catch (err) {
    console.error(err);
    return respond_(fail_('Kesalahan server: ' + errorMessage_(err)), callback);
  }
}

function respond_(payload, callback) {
  var json = JSON.stringify(payload);
  var namaCallback = String(callback || '');
  if (/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/.test(namaCallback)) {
    return ContentService
      .createTextOutput(namaCallback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function ok_(data) {
  return { success: true, data: data };
}

function fail_(message) {
  return { success: false, message: message };
}

function parseBody_(e) {
  if (e && e.postData && e.postData.contents) {
    try {
      return JSON.parse(e.postData.contents);
    } catch (err) {
      // Body bukan JSON; gunakan parameter form-urlencoded.
    }
  }
  return (e && e.parameter) || {};
}

/* ================================================================
 *  PELANGGARAN
 * ================================================================ */

function simpanPelanggaran_(body) {
  var nisn = cleanText_(pick_(body, ['nisn', 'nis', 'studentNisn', 'studentNis']), 30);
  var nama = cleanText_(pick_(body, ['nama', 'namaSiswa', 'studentName']), 100);
  var kelas = cleanText_(pick_(body, ['kelas', 'studentClass']), 50);
  var jenis = cleanText_(pick_(body, ['jenis', 'jenisPelanggaran', 'violationType']), 120);
  var keterangan = cleanText_(pick_(body, ['keterangan', 'violationNote', 'note']), 500);

  if (!nisn || !nama || !kelas || !jenis) {
    return fail_('NISN, nama siswa, kelas, dan jenis pelanggaran wajib diisi.');
  }

  if (!Object.prototype.hasOwnProperty.call(VIOLATION_POINTS, jenis)) {
    return fail_('Jenis pelanggaran tidak valid. Gunakan aksi GET ?action=jenis untuk melihat daftar jenis.');
  }

  var tanggal = normalizeDate_(pick_(body, ['tanggal', 'violationDate']));
  if (!tanggal) {
    return fail_('Format tanggal tidak valid. Gunakan format YYYY-MM-DD.');
  }

  if (VALIDASI_KELAS && !kelasTerdaftar_(kelas)) {
    return fail_('Kelas "' + kelas + '" tidak terdaftar atau tidak aktif pada sheet Kelas.');
  }

  var poin = VIOLATION_POINTS[jenis];
  var id = makeId_('PLG');
  var record = {
    'ID Pelanggaran': id,
    'Waktu Input': nowTimestamp_(),
    'Tanggal Kejadian': tanggal,
    'NISN': nisn,
    'Nama Siswa': nama,
    'Kelas': kelas,
    'Jenis Pelanggaran': jenis,
    'Poin': poin,
    'Keterangan': keterangan,
    'Dicatat Oleh': 'Kesiswaan'
  };

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    appendRecord_(SHEET_PELANGGARAN, HEADERS.PELANGGARAN, record);
  } finally {
    lock.releaseLock();
  }

  return ok_({
    id: id,
    nisn: nisn,
    nis: nisn,
    poin: poin,
    tanggal: tanggal,
    totalPoinSiswa: hitungTotalPoin_(nisn),
    dicatatOleh: record['Dicatat Oleh']
  });
}

function getPelanggaran_(params) {
  var nisn = cleanText_(pick_(params, ['nisn', 'nis']), 30).toLowerCase();
  var kelas = cleanText_(params.kelas, 50).toLowerCase();
  var limit = parseInt(params.limit, 10);
  if (!limit || limit < 1) {
    limit = 50;
  }
  if (limit > 500) {
    limit = 500;
  }

  var table = readTable_(SHEET_PELANGGARAN, HEADERS.PELANGGARAN);
  var hasil = [];

  for (var i = table.rows.length - 1; i >= 0; i -= 1) {
    var row = table.rows[i];
    if (nisn && getRowNisn_(row).toLowerCase() !== nisn) {
      continue;
    }
    if (kelas && String(row['Kelas']).toLowerCase() !== kelas) {
      continue;
    }
    hasil.push(mapPelanggaran_(row));
    if (hasil.length >= limit) {
      break;
    }
  }

  return ok_(hasil);
}

function getRiwayatSiswa_(params) {
  var nisn = cleanText_(pick_(params, ['nisn', 'nis']), 30);
  if (!nisn) {
    return fail_('Parameter NISN wajib diisi.');
  }

  var table = readTable_(SHEET_PELANGGARAN, HEADERS.PELANGGARAN);
  var riwayat = [];
  var totalPoin = 0;
  var nama = '';
  var kelas = '';

  for (var i = 0; i < table.rows.length; i += 1) {
    var row = table.rows[i];
    if (getRowNisn_(row).trim() !== nisn) {
      continue;
    }
    totalPoin += Number(row['Poin']) || 0;
    nama = row['Nama Siswa'] || nama;
    kelas = row['Kelas'] || kelas;
    riwayat.push(mapPelanggaran_(row));
  }

  riwayat.sort(function (a, b) {
    return String(b.tanggal).localeCompare(String(a.tanggal));
  });

  return ok_({
    nisn: nisn,
    nis: nisn,
    nama: nama,
    kelas: kelas,
    totalPoin: totalPoin,
    status: statusKedisiplinan_(totalPoin),
    jumlahPelanggaran: riwayat.length,
    riwayat: riwayat.slice(0, 20)
  });
}

function getRowNisn_(row) {
  return String(row['NISN'] || row['NIS'] || '');
}

function mapPelanggaran_(row) {
  var nisn = getRowNisn_(row);
  return {
    id: row['ID Pelanggaran'],
    waktuInput: row['Waktu Input'],
    tanggal: formatTanggalOutput_(row['Tanggal Kejadian']),
    nisn: nisn,
    nis: nisn,
    nama: row['Nama Siswa'],
    kelas: row['Kelas'],
    jenis: row['Jenis Pelanggaran'],
    poin: Number(row['Poin']) || 0,
    keterangan: row['Keterangan'],
    dicatatOleh: row['Dicatat Oleh']
  };
}

function hitungTotalPoin_(nisn) {
  var table = readTable_(SHEET_PELANGGARAN, HEADERS.PELANGGARAN);
  var total = 0;
  for (var i = 0; i < table.rows.length; i += 1) {
    if (getRowNisn_(table.rows[i]).trim() === String(nisn).trim()) {
      total += Number(table.rows[i]['Poin']) || 0;
    }
  }
  return total;
}

function statusKedisiplinan_(poin) {
  if (poin >= 50) {
    return 'Pelanggaran Berat';
  }
  if (poin >= 25) {
    return 'Peringatan Keras';
  }
  if (poin >= 10) {
    return 'Perlu Perhatian';
  }
  return 'Baik';
}

/* ================================================================
 *  KELAS
 * ================================================================ */

function listKelas_() {
  var table = readTable_(SHEET_KELAS, HEADERS.KELAS);
  var hasil = [];

  for (var i = 0; i < table.rows.length; i += 1) {
    var row = table.rows[i];
    var nama = String(row['Nama Kelas'] == null ? '' : row['Nama Kelas']).trim();
    if (!nama) {
      continue;
    }
    hasil.push({
      nama: nama,
      tingkat: row['Tingkat']
    });
  }

  hasil.sort(function (a, b) {
    return String(a.nama).localeCompare(String(b.nama));
  });

  return hasil;
}

function kelasTerdaftar_(namaKelas) {
  var target = String(namaKelas).trim().toLowerCase();
  var list = listKelas_();
  for (var i = 0; i < list.length; i += 1) {
    if (String(list[i].nama).trim().toLowerCase() === target) {
      return true;
    }
  }
  for (var j = 0; j < DEFAULT_KELAS.length; j += 1) {
    if (String(DEFAULT_KELAS[j]).trim().toLowerCase() === target) {
      return true;
    }
  }
  return false;
}

function tambahKelas_(body) {

  var nama = cleanText_(pick_(body, ['nama', 'namaKelas']), 50);
  var tingkat = cleanText_(body.tingkat, 10);

  if (!nama) {
    return fail_('Nama kelas wajib diisi.');
  }

  var table = readTable_(SHEET_KELAS, HEADERS.KELAS);
  for (var i = 0; i < table.rows.length; i += 1) {
    if (String(table.rows[i]['Nama Kelas']).trim().toLowerCase() === nama.toLowerCase()) {
      return fail_('Kelas "' + nama + '" sudah terdaftar.');
    }
  }

  if (!tingkat) {
    tingkat = nama.split(' ')[0] || '';
  }

  appendRecord_(SHEET_KELAS, HEADERS.KELAS, {
    'Nama Kelas': nama,
    'Tingkat': tingkat
  });

  return ok_({
    nama: nama,
    tingkat: tingkat
  });
}

/* (Autentikasi dan tabel Akun dihapus - akses tanpa login) */

/* ================================================================
 *  UTILITAS SHEET
 * ================================================================ */

function readTable_(sheetName, headers) {
  var sheet = getSheet_(sheetName, headers);
  var lastRow = sheet.getLastRow();
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var headerRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var index = {};

  for (var c = 0; c < headerRow.length; c += 1) {
    var key = String(headerRow[c]).trim();
    if (key) {
      index[key] = c;
    }
  }

  var rows = [];
  if (lastRow > 1) {
    var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    for (var r = 0; r < values.length; r += 1) {
      var obj = { _rowNumber: r + 2 };
      for (var k in index) {
        if (Object.prototype.hasOwnProperty.call(index, k)) {
          obj[k] = values[r][index[k]];
        }
      }
      rows.push(obj);
    }
  }

  return { sheet: sheet, index: index, rows: rows };
}

function getSheet_(sheetName, headers) {
  var ss = getSpreadsheet_();
  return setupSheet_(ss, sheetName, headers);
}

function appendRecord_(sheetName, headers, record) {
  var sheet = getSheet_(sheetName, headers);
  var lastCol = Math.max(sheet.getLastColumn(), headers.length);
  var headerRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var values = [];

  for (var i = 0; i < headerRow.length; i += 1) {
    var key = String(headerRow[i]).trim();
    values.push(key && Object.prototype.hasOwnProperty.call(record, key) ? safeCell_(record[key]) : '');
  }

  sheet.appendRow(values);
  return sheet.getLastRow();
}

function updateField_(sheet, rowNumber, headerName, value) {
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var headerRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  for (var i = 0; i < headerRow.length; i += 1) {
    if (String(headerRow[i]).trim() === headerName) {
      sheet.getRange(rowNumber, i + 1).setValue(safeCell_(value));
      return true;
    }
  }
  return false;
}

function safeCell_(value) {
  if (value === null || value === undefined) {
    return '';
  }
  if (value instanceof Date) {
    return value;
  }
  var text = String(value);
  if (/^[=+\-@]/.test(text)) {
    return "'" + text;
  }
  return text;
}

/* ================================================================
 *  UTILITAS UMUM
 * ================================================================ */

function listJenisPelanggaran_() {
  var hasil = [];
  for (var jenis in VIOLATION_POINTS) {
    if (Object.prototype.hasOwnProperty.call(VIOLATION_POINTS, jenis)) {
      hasil.push({ jenis: jenis, poin: VIOLATION_POINTS[jenis] });
    }
  }
  hasil.sort(function (a, b) {
    return a.poin - b.poin || a.jenis.localeCompare(b.jenis);
  });
  return hasil;
}

function pick_(obj, keys) {
  for (var i = 0; i < keys.length; i += 1) {
    var value = obj ? obj[keys[i]] : undefined;
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }
  return '';
}

function cleanText_(value, maxLength) {
  var text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  if (maxLength && text.length > maxLength) {
    text = text.slice(0, maxLength);
  }
  return text;
}



function normalizeDate_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, APP_TIMEZONE, 'yyyy-MM-dd');
  }

  var text = String(value == null ? '' : value).trim();
  if (!text) {
    return Utilities.formatDate(new Date(), APP_TIMEZONE, 'yyyy-MM-dd');
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  var match = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (match) {
    var hari = match[1].length === 1 ? '0' + match[1] : match[1];
    var bulan = match[2].length === 1 ? '0' + match[2] : match[2];
    return match[3] + '-' + bulan + '-' + hari;
  }

  var parsed = new Date(text);
  if (!isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, APP_TIMEZONE, 'yyyy-MM-dd');
  }

  return '';
}

function formatTanggalOutput_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, APP_TIMEZONE, 'yyyy-MM-dd');
  }
  var text = String(value == null ? '' : value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    return text.slice(0, 10);
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(text)) {
    var parts = text.split('/');
    return parts[2] + '-' + parts[1] + '-' + parts[0];
  }
  return text;
}

function nowTimestamp_() {
  return Utilities.formatDate(new Date(), APP_TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
}

function makeId_(prefix) {
  var stamp = Utilities.formatDate(new Date(), APP_TIMEZONE, 'yyyyMMddHHmmss');
  var acak = String(Math.floor(Math.random() * 9000) + 1000);
  return prefix + '-' + stamp + '-' + acak;
}

function errorMessage_(err) {
  if (!err) {
    return 'Tidak diketahui.';
  }
  return err.message || String(err);
}

/**
 * Hapus sheet "Akun" dari spreadsheet (jika ada).
 * Jalankan dari editor Apps Script untuk spreadsheet yang sesuai.
 */
function hapusSheetAkun() {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName('Akun');
  if (!sheet) {
    return { success: true, message: 'Sheet "Akun" tidak ditemukan.' };
  }

  if (ss.getSheets().length <= 1) {
    return { success: false, message: 'Tidak dapat menghapus sheet terakhir pada spreadsheet.' };
  }

  ss.deleteSheet(sheet);
  return { success: true, message: 'Sheet "Akun" berhasil dihapus.' };
}
