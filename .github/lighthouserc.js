let previewBaseUrl = process.env.LHCI_PREVIEW_URL || 'http://localhost:3000';
console.log("Initial preview URL:", previewBaseUrl);

module.exports = {
  ci: {
    collect: {
      url: [
        `${previewBaseUrl}/`,
        `${previewBaseUrl}/feeds`,
        `${previewBaseUrl}/feeds/gtfs/mdb-2126`,
        `${previewBaseUrl}/feeds/gtfs_rt/mdb-2585`,
        `${previewBaseUrl}/gbfs/gbfs-flamingo_porirua`
      ],
      numberOfRuns: 1, // 1 to speed up the CI process but can be increased for more reliable results
      settings: {
        formFactor: 'desktop',
        throttlingMethod: 'simulate',
        skipAudits: ['robots-txt', 'is-crawlable'],
        screenEmulation: {
          mobile: false,
          width: 1350,
          height: 940,
          deviceScaleRatio: 1,
          disabled: false
        },
        extraHeaders: JSON.stringify({
          'x-vercel-protection-bypass': String(process.env.VERCEL_AUTOMATION_BYPASS_SECRET)
        })
      }
    },
    upload: {
      target: 'temporary-public-storage'
    }
  }
};