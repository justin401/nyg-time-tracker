// Copied from command-center/src/lib/cortana-email-signature.ts (canonical Cortana signature).
export const CORTANA_SIGNATURE_HTML = `<br><br>
<table cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,Helvetica,sans-serif;color:#333333;max-width:500px;">
<tr><td style="padding-bottom:12px;border-bottom:3px solid #1a3a5c;">
<table cellpadding="0" cellspacing="0" border="0"><tr><td style="vertical-align:top;">
<table cellpadding="0" cellspacing="0" border="0">
<tr><td style="font-size:18px;font-weight:bold;color:#1a3a5c;padding-bottom:2px;">&#129302; Cortana</td></tr>
<tr><td style="font-size:13px;color:#4a90d9;padding-bottom:6px;">Top Tier AI Assistant, Team Taparra</td></tr>
<tr><td style="font-size:12px;color:#555555;padding-bottom:2px;">eXp Realty</td></tr>
<tr><td style="font-size:11px;color:#777777;">6600 Kalanianaole Hwy Suite #114, Honolulu, HI 96825</td></tr>
</table></td></tr></table></td></tr>
<tr><td style="padding-top:10px;padding-bottom:10px;">
<table cellpadding="0" cellspacing="0" border="0">
<tr><td style="font-size:12px;color:#555555;padding-bottom:4px;"><span style="color:#1a3a5c;font-weight:bold;">Justin Taparra</span> (Agent/Owner): <a href="tel:8083496499" style="color:#4a90d9;text-decoration:none;">(808) 349-6499</a></td></tr>
<tr><td style="font-size:12px;color:#555555;padding-bottom:4px;"><span style="color:#1a3a5c;font-weight:bold;">Sam Palompo</span> (Assistant): <a href="tel:8087789346" style="color:#4a90d9;text-decoration:none;">(808) 778-9346</a></td></tr>
<tr><td style="font-size:12px;color:#555555;"><a href="mailto:cortana-ai@teamtaparra.com" style="color:#4a90d9;text-decoration:none;">cortana-ai@teamtaparra.com</a></td></tr>
</table></td></tr>
<tr><td style="padding-top:8px;border-top:1px solid #e0e0e0;">
<table cellpadding="0" cellspacing="0" border="0"><tr>
<td style="padding-right:12px;"><a href="https://www.instagram.com/officialjustintaparra/" style="text-decoration:none;font-size:12px;color:#4a90d9;">Instagram</a></td>
<td style="padding-right:12px;color:#cccccc;">|</td>
<td><a href="https://www.yelp.com/biz/team-taparra-exp-realty-waipahu-2" style="text-decoration:none;font-size:12px;color:#4a90d9;">Yelp</a></td>
</tr></table></td></tr>
<tr><td style="padding-top:10px;"><p style="font-size:10px;color:#999999;margin:0;line-height:1.4;">This message was sent by Cortana, Team Taparra's AI assistant. If you have questions, please contact Justin or Sam directly using the numbers above.</p></td></tr>
</table>`;

// The dark-on-light logo (team-taparra-bold.png) is the only one that works
// on a white email -- tth-logo.png is solid white and disappears.
export const EMAIL_LOGO_URL = "https://command.toptierhawaii.com/logos/team-taparra-bold.png";
