export type Lang = 'en' | 'id';

export interface Strings {
  locale: string;
  skip: string;
  brand: string;
  brandSuffix: string;
  language: string;
  themeToDark: string;
  themeToLight: string;
  source: string;

  headline: {
    ok: string;
    slow: string;
    down: (label: string) => string;
    downMany: (count: number) => string;
    unknown: string;
  };
  checked: (relative: string) => string;
  justNow: string;
  cadence: (minutes: number) => string;
  summaryRecent: string;
  summarySoFar: (days: number) => string;
  summary: (period: string) => string;
  collecting: string;

  stale: (age: string) => string;

  status: { up: string; degraded: string; down: string; unknown: string };
  services: string;
  daysAgo: (days: number) => string;
  today: string;
  uptimeOver90: string;
  noDataYet: string;
  stripLabel: (name: string, uptime: string) => string;

  day: {
    none: string;
    allPassed: (checks: number) => string;
    mixed: (failed: number, slow: number, checks: number) => string;
    average: (ms: string) => string;
  };

  panel: {
    chartTitle: string;
    chartLabel: (median: string, slowest: string) => string;
    chartScale: (max: string) => string;
    hoursAgo: string;
    now: string;
    noSamples: string;
    uptime: string;
    last24h: string;
    last7d: string;
    last30d: string;
    last90d: string;
    median: string;
    slowest: string;
    lastError: string;
    open: string;
    runbook: string;
    daysUtc: string;
  };

  incidents: {
    title: string;
    none: (since: string | null) => string;
    outage: (name: string) => string;
    slow: (name: string) => string;
    ongoing: string;
    since: (time: string) => string;
    range: (from: string, to: string) => string;
    lasted: (duration: string) => string;
    details: string;
  };

  duration: {
    minute: (n: number) => string;
    hour: (n: number) => string;
    day: (n: number) => string;
  };

  error: { title: string; body: string; retry: string };
  footer: { how: (minutes: number) => string; days: string; runbooks: string };
}

const pluralEn = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const strings: Record<Lang, Strings> = {
  en: {
    locale: 'en-GB',
    skip: 'Skip to content',
    brand: 'SatuArah',
    brandSuffix: 'Status',
    language: 'Language',
    themeToDark: 'Switch to dark theme',
    themeToLight: 'Switch to light theme',
    source: 'Source on GitHub',

    headline: {
      ok: 'Everything is working.',
      slow: 'Some services are slow.',
      down: (label) => `${label} is not responding.`,
      downMany: (count) => `${count} services are not responding.`,
      unknown: 'Waiting for the first check.',
    },
    checked: (relative) => `Last checked ${relative}.`,
    justNow: 'just now',
    cadence: (minutes) => `Services are checked about every ${minutes} minutes.`,
    summaryRecent: 'Over the last 30 days',
    summarySoFar: (days) => `In the ${pluralEn(days, 'day', 'days')} monitored so far`,
    summary: (period) =>
      `${period}, services answered {availability} of checks. Median response time is {median}.`,
    collecting: 'History fills in as checks run.',

    stale: (age) =>
      `Monitoring data is ${age} old. Checks may be delayed, and the services themselves may be fine.`,

    status: { up: 'Working', degraded: 'Slow', down: 'Not responding', unknown: 'No data yet' },
    services: 'Services',
    daysAgo: (days) => `${days} days ago`,
    today: 'Today',
    uptimeOver90: 'over 90 days',
    noDataYet: 'No data yet',
    stripLabel: (name, uptime) =>
      `${name}, availability by day. ${uptime}. Use the arrow keys to move between days.`,

    day: {
      none: 'No checks recorded',
      allPassed: (checks) => `All ${checks} checks passed`,
      mixed: (failed, slow, checks) => {
        const parts = [];
        if (failed > 0) parts.push(`${failed} failed`);
        if (slow > 0) parts.push(`${slow} slow`);
        return `${parts.join(', ')} of ${checks} checks`;
      },
      average: (ms) => `Average response ${ms}`,
    },

    panel: {
      chartTitle: 'Response time, last 24 hours',
      chartLabel: (median, slowest) =>
        `Response time over the last 24 hours. Median ${median}, slowest 5% ${slowest}.`,
      chartScale: (max) => `Scale up to ${max}.`,
      hoursAgo: '24 hours ago',
      now: 'Now',
      noSamples: 'No checks in the last 24 hours.',
      uptime: 'Availability',
      last24h: 'Last 24 hours',
      last7d: 'Last 7 days',
      last30d: 'Last 30 days',
      last90d: 'Last 90 days',
      median: 'Median response',
      slowest: 'Slowest 5%',
      lastError: 'Last problem',
      open: 'Open the service',
      runbook: 'Runbook',
      daysUtc: 'Days are counted in UTC.',
    },

    incidents: {
      title: 'Past incidents',
      none: (since) =>
        since ? `No incidents since monitoring began on ${since}.` : 'No incidents recorded yet.',
      outage: (name) => `${name} stopped responding`,
      slow: (name) => `${name} was slow`,
      ongoing: 'Ongoing',
      since: (time) => `since ${time}`,
      range: (from, to) => `${from} to ${to}`,
      lasted: (duration) => `Lasted ${duration}`,
      details: 'Details',
    },

    duration: {
      minute: (n) => pluralEn(n, 'minute', 'minutes'),
      hour: (n) => pluralEn(n, 'hour', 'hours'),
      day: (n) => pluralEn(n, 'day', 'days'),
    },

    error: {
      title: 'Status data could not be loaded.',
      body: 'This only means this page could not reach the monitoring data. It does not mean the services are down. Try again in a moment.',
      retry: 'Try again',
    },
    footer: {
      how: (minutes) =>
        `Checks run every ${minutes} minutes on GitHub Actions in the United States. Response times show how fast a service answers from there, not from your connection.`,
      days: 'Days follow UTC.',
      runbooks: 'Runbooks',
    },
  },

  id: {
    locale: 'id-ID',
    skip: 'Lewati ke konten',
    brand: 'SatuArah',
    brandSuffix: 'Status',
    language: 'Bahasa',
    themeToDark: 'Ganti ke tema gelap',
    themeToLight: 'Ganti ke tema terang',
    source: 'Kode sumber di GitHub',

    headline: {
      ok: 'Semua berjalan normal.',
      slow: 'Beberapa layanan melambat.',
      down: (label) => `${label} tidak merespons.`,
      downMany: (count) => `${count} layanan tidak merespons.`,
      unknown: 'Menunggu pemeriksaan pertama.',
    },
    checked: (relative) => `Diperiksa terakhir ${relative}.`,
    justNow: 'baru saja',
    cadence: (minutes) => `Layanan diperiksa sekitar tiap ${minutes} menit.`,
    summaryRecent: 'Dalam 30 hari terakhir',
    summarySoFar: (days) => `Dalam ${days} hari pemantauan sejauh ini`,
    summary: (period) =>
      `${period}, layanan menjawab {availability} dari seluruh pemeriksaan. Waktu respons median {median}.`,
    collecting: 'Riwayat terisi seiring pemeriksaan berjalan.',

    stale: (age) =>
      `Data pemantauan sudah ${age}. Pemeriksaan mungkin tertunda, dan layanannya sendiri bisa saja baik-baik saja.`,

    status: {
      up: 'Normal',
      degraded: 'Lambat',
      down: 'Tidak merespons',
      unknown: 'Belum ada data',
    },
    services: 'Layanan',
    daysAgo: (days) => `${days} hari lalu`,
    today: 'Hari ini',
    uptimeOver90: 'selama 90 hari',
    noDataYet: 'Belum ada data',
    stripLabel: (name, uptime) =>
      `${name}, ketersediaan per hari. ${uptime}. Gunakan tombol panah untuk berpindah hari.`,

    day: {
      none: 'Belum ada pemeriksaan',
      allPassed: (checks) => `Semua ${checks} pemeriksaan lolos`,
      mixed: (failed, slow, checks) => {
        const parts = [];
        if (failed > 0) parts.push(`${failed} gagal`);
        if (slow > 0) parts.push(`${slow} lambat`);
        return `${parts.join(', ')} dari ${checks} pemeriksaan`;
      },
      average: (ms) => `Respons rata-rata ${ms}`,
    },

    panel: {
      chartTitle: 'Waktu respons, 24 jam terakhir',
      chartLabel: (median, slowest) =>
        `Waktu respons 24 jam terakhir. Median ${median}, 5% terlambat ${slowest}.`,
      chartScale: (max) => `Skala sampai ${max}.`,
      hoursAgo: '24 jam lalu',
      now: 'Sekarang',
      noSamples: 'Belum ada pemeriksaan dalam 24 jam terakhir.',
      uptime: 'Ketersediaan',
      last24h: '24 jam terakhir',
      last7d: '7 hari terakhir',
      last30d: '30 hari terakhir',
      last90d: '90 hari terakhir',
      median: 'Respons median',
      slowest: '5% terlambat',
      lastError: 'Masalah terakhir',
      open: 'Buka layanan',
      runbook: 'Runbook',
      daysUtc: 'Hari dihitung dalam UTC.',
    },

    incidents: {
      title: 'Insiden sebelumnya',
      none: (since) =>
        since
          ? `Tidak ada insiden sejak pemantauan dimulai pada ${since}.`
          : 'Belum ada insiden tercatat.',
      outage: (name) => `${name} berhenti merespons`,
      slow: (name) => `${name} melambat`,
      ongoing: 'Berlangsung',
      since: (time) => `sejak ${time}`,
      range: (from, to) => `${from} sampai ${to}`,
      lasted: (duration) => `Berlangsung ${duration}`,
      details: 'Detail',
    },

    duration: {
      minute: (n) => `${n} menit`,
      hour: (n) => `${n} jam`,
      day: (n) => `${n} hari`,
    },

    error: {
      title: 'Data status tidak bisa dimuat.',
      body: 'Ini hanya berarti halaman ini tidak bisa menjangkau data pemantauan. Bukan berarti layanannya mati. Coba lagi sebentar lagi.',
      retry: 'Coba lagi',
    },
    footer: {
      how: (minutes) =>
        `Pemeriksaan berjalan tiap ${minutes} menit di GitHub Actions, Amerika Serikat. Waktu respons menunjukkan seberapa cepat layanan menjawab dari sana, bukan dari koneksimu.`,
      days: 'Hari mengikuti UTC.',
      runbooks: 'Runbook',
    },
  },
};

export function detectLang(saved: string | null, browser: string): Lang {
  if (saved === 'en' || saved === 'id') return saved;
  return browser.toLowerCase().startsWith('id') ? 'id' : 'en';
}
