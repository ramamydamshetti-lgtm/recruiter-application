const MONTHS = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
  apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
  aug: 7, august: 7, sep: 8, sept: 8, september: 8,
  oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

function parsePeriodDate(value) {
  if (!value) return null;
  const raw = String(value).trim().toLowerCase();
  if (!raw || ["present", "current", "now", "till date", "till now", "ongoing"].includes(raw)) {
    return new Date();
  }

  const iso = raw.match(/^(\d{4})-(\d{1,2})$/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, 1);

  const yearOnly = raw.match(/^(\d{4})$/);
  if (yearOnly) return new Date(Number(yearOnly[1]), 0, 1);

  const named = raw.match(/([a-z]+)\s*[,']?\s*(\d{4})/);
  if (named && MONTHS[named[1]] !== undefined) {
    return new Date(Number(named[2]), MONTHS[named[1]], 1);
  }

  const reversed = raw.match(/(\d{4})\s*[-/]\s*([a-z]+)/);
  if (reversed && MONTHS[reversed[2]] !== undefined) {
    return new Date(Number(reversed[1]), MONTHS[reversed[2]], 1);
  }

  return null;
}

function monthsBetween(start, end) {
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
}

function mergeRanges(ranges) {
  if (!ranges.length) return [];
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const merged = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = merged[merged.length - 1];
    const cur = sorted[i];
    if (cur[0] <= prev[1]) {
      prev[1] = new Date(Math.max(prev[1].getTime(), cur[1].getTime()));
    } else {
      merged.push(cur);
    }
  }
  return merged;
}

export function calculateExperienceMonths(periods) {
  if (!Array.isArray(periods) || !periods.length) return null;

  const ranges = periods
    .map((p) => {
      const start = parsePeriodDate(p.from ?? p.start ?? p.start_date);
      const end = parsePeriodDate(p.to ?? p.end ?? p.end_date);
      if (!start || !end || end < start) return null;
      return [start, end];
    })
    .filter(Boolean);

  if (!ranges.length) return null;

  const merged = mergeRanges(ranges);
  return merged.reduce((sum, [start, end]) => sum + monthsBetween(start, end), 0);
}

export function formatExperienceDisplay(totalMonths) {
  if (!totalMonths || totalMonths <= 0) {
    return { display: "", months: 0, years: 0, yearsPart: 0, monthsPart: 0 };
  }

  const yearsPart = Math.floor(totalMonths / 12);
  const monthsPart = totalMonths % 12;
  const years = Math.round((totalMonths / 12) * 10) / 10;

  let display;
  if (yearsPart === 0) {
    display = `${monthsPart} Month${monthsPart === 1 ? "" : "s"}`;
  } else if (monthsPart === 0) {
    display = `${yearsPart} Year${yearsPart === 1 ? "" : "s"}`;
  } else {
    display = `${yearsPart} Year${yearsPart === 1 ? "" : "s"} ${monthsPart} Month${monthsPart === 1 ? "" : "s"}`;
  }

  return { display, months: totalMonths, years, yearsPart, monthsPart };
}

function parseStatedYears(raw) {
  if (!raw) return null;
  const m = String(raw).match(/(\d+(\.\d+)?)/);
  return m ? Math.round(parseFloat(m[1]) * 12) : null;
}

function resolveOneExperience({ stated, periods, fallbackPeriods }) {
  const fromPeriods = calculateExperienceMonths(periods);
  const fromFallback = !fromPeriods ? calculateExperienceMonths(fallbackPeriods) : null;
  const fromStated = parseStatedYears(stated);
  const totalMonths = fromPeriods ?? fromFallback ?? fromStated;
  return formatExperienceDisplay(totalMonths);
}

export function resolveExperienceFields({
  total_experience,
  relevant_experience,
  work_periods,
  relevant_work_periods,
}) {
  const total = resolveOneExperience({
    stated: total_experience,
    periods: work_periods,
  });

  const relevant = resolveOneExperience({
    stated: relevant_experience,
    periods: relevant_work_periods,
    fallbackPeriods: work_periods,
  });

  return {
    total_experience: total.display,
    total_experience_months: total.months,
    total_experience_years: total.years,
    relevant_experience: relevant.display,
    relevant_experience_months: relevant.months,
    relevant_experience_years: relevant.years,
  };
}
