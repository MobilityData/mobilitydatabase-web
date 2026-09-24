# Email Deliverability Setup (Brevo & Outlook Junk Prevention)

## Overview
Default Firebase Authentication verification emails lack custom domain authentication and branded styling, causing aggressive filtering algorithms (especially Microsoft Outlook / Exchange / Office 365) to route verification emails to Junk.

## Solution Architecture
1. **Custom SMTP / Transactional Email Provider**: We integrate Brevo (`https://api.brevo.com/v3/smtp/email`) to send HTML branded verification messages with domain signing.
2. **Domain Authentication Requirements**:
   - **SPF**: Add `include:spf.brevo.com` to `mobilitydatabase.org` TXT records.
   - **DKIM**: Add the DKIM TXT key provided in Brevo Domain Settings (`mail._domainkey.mobilitydatabase.org`).
   - **DMARC**: Set a standard DMARC policy (e.g. `v=DMARC1; p=none; rua=mailto:dmarc@mobilitydata.org`).
3. **Environment Variables**:
   - `BREVO_API_KEY`: API key from Brevo console.
   - `BREVO_SENDER_EMAIL`: Verified sender address (e.g. `no-reply@mobilitydatabase.org`).
4. **Client Guidance**:
   - The user verification page informs users to inspect their Junk/Spam folder and explicitly mark messages from `mobilitydatabase.org` as "Not Junk".
