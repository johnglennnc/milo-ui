// labParser.js

export function extractLabValues(text) {
  const lines = text.toLowerCase().split(/\n|\.|,/);
  const labs = {};

  const patterns = {
    estradiol: /estradiol.*?(\d+(\.\d+)?)/,
    progesterone: /progesterone.*?(\d+(\.\d+)?)/,
    testosterone_total: /testosterone.*total.*?(\d+(\.\d+)?)/,
    testosterone_free: /free testosterone.*?(\d+(\.\d+)?)/,
    dhea_s: /dhea(-|\s)?s(ulfate)?.*?(\d+(\.\d+)?)/,
    vitamin_d: /vitamin[\s-]?d(?!.*\w).*?(\d+(\.\d+)?)/,
    tsh: /\btsh\b.*?(\d+(\.\d+)?)/,
    free_t3: /free[\s-]?(t3|triiodothyronine).*?(\d+(\.\d+)?)/,
    free_t4: /free[\s-]?t4|t4,?\s*free.*?(\d+(\.\d+)?)/,
    igf1: /igf[-\s]?1.*?(\d+(\.\d+)?)/,
    psa: /\bpsa\b.*?(\d+(\.\d+)?)/,
  };

  for (const line of lines) {
    for (const [key, regex] of Object.entries(patterns)) {
      const match = line.match(regex);
      if (match) {
        const value = parseFloat(match[1] || match[3]);
        if (!isNaN(value)) labs[key] = value;
      }
    }
  }

  return labs;
}
