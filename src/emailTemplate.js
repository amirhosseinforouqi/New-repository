// The announcement email, embedded verbatim. `[FIRST NAME]` on the greeting line
// is a literal placeholder token replaced per recipient at send time — see
// `personalize()` in src/lib/personalize.js.
export const EMAIL_TEMPLATE = `<!DOCTYPE html>
<html lang="en" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:v="urn:schemas-microsoft-com:vml"><head>
<meta charset="utf-8"/>
<meta content="width=device-width,initial-scale=1" name="viewport"/>
<meta content="IE=edge" http-equiv="X-UA-Compatible"/>
<meta content="light dark" name="color-scheme"/>
<meta content="light dark" name="supported-color-schemes"/>
<title>New Office • Expanded Mortgage &amp; Financing Solutions</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style type="text/css">@media screen and (max-width: 600px) {
    .p-lr {
        padding-left: 20px;
        padding-right: 20px
        }
    .h1 {
        font-size: 26px;
        line-height: 34px
        }
    }</style>
</head>
<body bgcolor="#E9E5DD" style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; background:#E9E5DD; margin:0; padding:0; width:100%" width="100%">
<table bgcolor="#E9E5DD" border="0" cellpadding="0" cellspacing="0" role="presentation" style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; border-collapse:collapse; width:100%; background:#E9E5DD; margin:0; padding:0" width="100%">
<tbody><tr>
<td align="center" bgcolor="#E9E5DD" style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; padding:24px 12px 40px 12px; background:#E9E5DD">
<span style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;color:#E9E5DD;">New office, expanded mortgage and financing solutions — and a wider set of options for your next move.</span>
<table bgcolor="#FDFCFA" border="0" cellpadding="0" cellspacing="0" role="presentation" style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; border-collapse:collapse; width:100%; max-width:600px; background:#FDFCFA" width="100%">
<tbody><tr>
<td bgcolor="#B08C45" height="4" style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; height:4px; line-height:4px; font-size:0; background:#B08C45">&nbsp;</td>
</tr>
<tr>
<td bgcolor="#14243A" class="p-lr" style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; background:#14243A; padding:22px 32px 20px 32px">
<table border="0" cellpadding="0" cellspacing="0" role="presentation" style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; border-collapse:collapse; width:100%" width="100%">
<tbody><tr>
<td align="left" style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; font-family:Helvetica, Arial, sans-serif; font-size:25px; line-height:24px; mso-line-height-rule:exactly; color:#FDFCFA; letter-spacing:0.04em">
                  ASIF JABBAROV
                  <div style="font-family:Helvetica, Arial, sans-serif;font-size:11px;line-height:16px;mso-line-height-rule:exactly;color:#9FB0C4;letter-spacing:0.14em;padding-top:5px;">MORTGAGE BROKER</div>
</td>
<td align="right" style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; font-family:Helvetica, Arial, sans-serif; font-size:10px; line-height:16px; mso-line-height-rule:exactly; color:#E4C98F; letter-spacing:0.16em" valign="top">&nbsp;</td>
</tr>
</tbody></table>
</td>
</tr>
<tr>
<td bgcolor="#1B2E48" class="p-lr" style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; background:#1B2E48; padding:40px 32px 42px 32px">
<div style="font-family:Helvetica, Arial, sans-serif;font-size:11px;line-height:16px;mso-line-height-rule:exactly;color:#D9B978;letter-spacing:0.18em;padding-bottom:16px;">A NOTE TO MY CLIENTS</div>
<div class="h1" style="font-family:Helvetica, Arial, sans-serif;font-size:32px;line-height:40px;mso-line-height-rule:exactly;color:#FDFCFA;">
              New office.<br/>A wider set of mortgage &amp; financing solutions.
            </div>
<div style="font-family:Helvetica, Arial, sans-serif;font-size:15px;line-height:24px;mso-line-height-rule:exactly;color:#B9C6D6;padding-top:18px;">
              More lenders, more programs, and an experienced team behind every file.
            </div>
</td>
</tr>
<tr>
<td bgcolor="#FDFCFA" class="p-lr" style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; background:#FDFCFA; padding:36px 32px 8px 32px">
<div style="font-family:Helvetica, Arial, sans-serif;font-size:17px;line-height:26px;mso-line-height-rule:exactly;color:#23292F;padding-bottom:18px;">Hi [FIRST NAME],</div>
<div style="font-family:Helvetica, Arial, sans-serif;font-size:15px;line-height:25px;mso-line-height-rule:exactly;color:#3F4750;padding-bottom:16px;">
              This is Asif Jabbarov, your mortgage broker — I had the pleasure of helping you with your mortgage in the past.
            </div>
<div style="font-family:Helvetica, Arial, sans-serif;font-size:15px;line-height:25px;mso-line-height-rule:exactly;color:#3F4750;padding-bottom:16px;">
              I'm glad to reconnect with you as a valued client and share an important update. I have moved to a new office and expanded my mortgage and financing services. I'm also working with an experienced team with strong mortgage and financing knowledge, which lets us offer more options and find solutions that fit your needs.
            </div>
<div style="font-family:Helvetica, Arial, sans-serif;font-size:15px;line-height:25px;mso-line-height-rule:exactly;color:#3F4750;">
              Whether you are looking to purchase a home, refinance an existing mortgage, or obtain financing for your business, we now offer a broader range of solutions.
            </div>
</td>
</tr>
<tr>
<td bgcolor="#FDFCFA" class="p-lr" style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; background:#FDFCFA; padding:34px 32px 0 32px">
<div style="font-family:Helvetica, Arial, sans-serif;font-size:11px;line-height:16px;mso-line-height-rule:exactly;color:#8A6A2C;letter-spacing:0.16em;padding-bottom:8px;">WHAT WE OFFER</div>
<div style="font-family:Helvetica, Arial, sans-serif;font-size:23px;line-height:31px;mso-line-height-rule:exactly;color:#23292F;">Current mortgage &amp; financing solutions</div>
<div style="height:1px;line-height:1px;font-size:0;background:#E3DED4;margin-top:22px;">&nbsp;</div>
</td>
</tr>
<tr>
<td bgcolor="#FDFCFA" class="p-lr" style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; background:#FDFCFA; padding:0 32px 0 32px">
<table border="0" cellpadding="0" cellspacing="0" role="presentation" style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; border-collapse:collapse; width:100%" width="100%">
<tbody><tr>
<td style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; width:44px; padding:18px 0 18px 0; font-family:Helvetica, Arial, sans-serif; font-size:14px; line-height:22px; mso-line-height-rule:exactly; color:#8A6A2C" valign="top" width="44">01</td>
<td style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; padding:18px 0 18px 0" valign="top">
<div style="font-family:Helvetica, Arial, sans-serif;font-size:15px;line-height:22px;mso-line-height-rule:exactly;color:#23292F;font-weight:bold;">Home purchases — First Time Home Buyer</div>
<div style="font-family:Helvetica, Arial, sans-serif;font-size:14px;line-height:22px;mso-line-height-rule:exactly;color:#666E78;padding-top:3px;">Low down payment options, subject to qualification.</div>
</td>
</tr>
<tr><td bgcolor="#EFEBE3" colspan="2" height="1" style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; height:1px; line-height:1px; font-size:0; background:#EFEBE3">&nbsp;</td></tr>
<tr>
<td style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; width:44px; padding:18px 0 18px 0; font-family:Helvetica, Arial, sans-serif; font-size:14px; line-height:22px; mso-line-height-rule:exactly; color:#8A6A2C" valign="top" width="44">02</td>
<td style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; padding:18px 0 18px 0" valign="top">
<div style="font-family:Helvetica, Arial, sans-serif;font-size:15px;line-height:22px;mso-line-height-rule:exactly;color:#23292F;font-weight:bold;">Mortgage refinancing</div>
<div style="font-family:Helvetica, Arial, sans-serif;font-size:14px;line-height:22px;mso-line-height-rule:exactly;color:#666E78;padding-top:3px;">Access equity, consolidate debt, or restructure your existing mortgage.</div>
</td>
</tr>
<tr><td bgcolor="#EFEBE3" colspan="2" height="1" style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; height:1px; line-height:1px; font-size:0; background:#EFEBE3">&nbsp;</td></tr>
<tr>
<td style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; width:44px; padding:18px 0 18px 0; font-family:Helvetica, Arial, sans-serif; font-size:14px; line-height:22px; mso-line-height-rule:exactly; color:#8A6A2C" valign="top" width="44">03</td>
<td style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; padding:18px 0 18px 0" valign="top">
<div style="font-family:Helvetica, Arial, sans-serif;font-size:15px;line-height:22px;mso-line-height-rule:exactly;color:#23292F;font-weight:bold;">Multiple-unit properties</div>
<div style="font-family:Helvetica, Arial, sans-serif;font-size:14px;line-height:22px;mso-line-height-rule:exactly;color:#666E78;padding-top:3px;">Financing for duplexes, triplexes, fourplexes, and other eligible multi-unit properties.</div>
</td>
</tr>
<tr><td bgcolor="#EFEBE3" colspan="2" height="1" style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; height:1px; line-height:1px; font-size:0; background:#EFEBE3">&nbsp;</td></tr>
<tr>
<td style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; width:44px; padding:18px 0 18px 0; font-family:Helvetica, Arial, sans-serif; font-size:14px; line-height:22px; mso-line-height-rule:exactly; color:#8A6A2C" valign="top" width="44">04</td>
<td style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; padding:18px 0 18px 0" valign="top">
<div style="font-family:Helvetica, Arial, sans-serif;font-size:15px;line-height:22px;mso-line-height-rule:exactly;color:#23292F;font-weight:bold;">Business &amp; commercial financing</div>
<div style="font-family:Helvetica, Arial, sans-serif;font-size:14px;line-height:22px;mso-line-height-rule:exactly;color:#666E78;padding-top:3px;">Solutions for business owners, investors, and self-employed clients.</div>
</td>
</tr>
<tr><td bgcolor="#EFEBE3" colspan="2" height="1" style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; height:1px; line-height:1px; font-size:0; background:#EFEBE3">&nbsp;</td></tr>
<tr>
<td style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; width:44px; padding:18px 0 18px 0; font-family:Helvetica, Arial, sans-serif; font-size:14px; line-height:22px; mso-line-height-rule:exactly; color:#8A6A2C" valign="top" width="44">05</td>
<td style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; padding:18px 0 18px 0" valign="top">
<div style="font-family:Helvetica, Arial, sans-serif;font-size:15px;line-height:22px;mso-line-height-rule:exactly;color:#23292F;font-weight:bold;">Private mortgages</div>
<div style="font-family:Helvetica, Arial, sans-serif;font-size:14px;line-height:22px;mso-line-height-rule:exactly;color:#666E78;padding-top:3px;">1st and 2nd mortgages for clients who may not qualify through traditional lenders.</div>
</td>
</tr>
<tr><td bgcolor="#EFEBE3" colspan="2" height="1" style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; height:1px; line-height:1px; font-size:0; background:#EFEBE3">&nbsp;</td></tr>
<tr>
<td style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; width:44px; padding:18px 0 18px 0; font-family:Helvetica, Arial, sans-serif; font-size:14px; line-height:22px; mso-line-height-rule:exactly; color:#8A6A2C" valign="top" width="44">06</td>
<td style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; padding:18px 0 18px 0" valign="top">
<div style="font-family:Helvetica, Arial, sans-serif;font-size:15px;line-height:22px;mso-line-height-rule:exactly;color:#23292F;font-weight:bold;">Self-employed &amp; business-income programs</div>
<div style="font-family:Helvetica, Arial, sans-serif;font-size:14px;line-height:22px;mso-line-height-rule:exactly;color:#666E78;padding-top:3px;">Flexible income-verification options through qualifying lenders.</div>
</td>
</tr>
<tr><td bgcolor="#EFEBE3" colspan="2" height="1" style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; height:1px; line-height:1px; font-size:0; background:#EFEBE3">&nbsp;</td></tr>
<tr>
<td style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; width:44px; padding:18px 0 18px 0; font-family:Helvetica, Arial, sans-serif; font-size:14px; line-height:22px; mso-line-height-rule:exactly; color:#8A6A2C" valign="top" width="44">07</td>
<td style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; padding:18px 0 18px 0" valign="top">
<div style="font-family:Helvetica, Arial, sans-serif;font-size:15px;line-height:22px;mso-line-height-rule:exactly;color:#23292F;font-weight:bold;">Non-permanent resident programs</div>
<div style="font-family:Helvetica, Arial, sans-serif;font-size:14px;line-height:22px;mso-line-height-rule:exactly;color:#666E78;padding-top:3px;">Mortgage solutions for eligible work-permit holders and non-PR clients.</div>
</td>
</tr>
<tr><td bgcolor="#EFEBE3" colspan="2" height="1" style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; height:1px; line-height:1px; font-size:0; background:#EFEBE3">&nbsp;</td></tr>
<tr>
<td style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; width:44px; padding:18px 0 18px 0; font-family:Helvetica, Arial, sans-serif; font-size:14px; line-height:22px; mso-line-height-rule:exactly; color:#8A6A2C" valign="top" width="44">08</td>
<td style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; padding:18px 0 18px 0" valign="top">
<div style="font-family:Helvetica, Arial, sans-serif;font-size:15px;line-height:22px;mso-line-height-rule:exactly;color:#23292F;font-weight:bold;">Construction &amp; specialized financing</div>
<div style="font-family:Helvetica, Arial, sans-serif;font-size:14px;line-height:22px;mso-line-height-rule:exactly;color:#666E78;padding-top:3px;">Financing for qualifying construction projects and unique property situations.</div>
</td>
</tr>
<tr><td bgcolor="#EFEBE3" colspan="2" height="1" style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; height:1px; line-height:1px; font-size:0; background:#EFEBE3">&nbsp;</td></tr>
<tr>
<td style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; width:44px; padding:18px 0 18px 0; font-family:Helvetica, Arial, sans-serif; font-size:14px; line-height:22px; mso-line-height-rule:exactly; color:#8A6A2C" valign="top" width="44">09</td>
<td style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; padding:18px 0 18px 0" valign="top">
<div style="font-family:Helvetica, Arial, sans-serif;font-size:15px;line-height:22px;mso-line-height-rule:exactly;color:#23292F;font-weight:bold;">Debt consolidation &amp; equity solutions</div>
<div style="font-family:Helvetica, Arial, sans-serif;font-size:14px;line-height:22px;mso-line-height-rule:exactly;color:#666E78;padding-top:3px;">Access available home equity for qualifying financial needs.</div>
</td>
</tr>
<tr><td bgcolor="#EFEBE3" colspan="2" height="1" style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; height:1px; line-height:1px; font-size:0; background:#EFEBE3">&nbsp;</td></tr>
<tr>
<td style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; width:44px; padding:18px 0 18px 0; font-family:Helvetica, Arial, sans-serif; font-size:14px; line-height:22px; mso-line-height-rule:exactly; color:#8A6A2C" valign="top" width="44">10</td>
<td style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; padding:18px 0 18px 0" valign="top">
<div style="font-family:Helvetica, Arial, sans-serif;font-size:15px;line-height:22px;mso-line-height-rule:exactly;color:#23292F;font-weight:bold;">Investment property financing</div>
<div style="font-family:Helvetica, Arial, sans-serif;font-size:14px;line-height:22px;mso-line-height-rule:exactly;color:#666E78;padding-top:3px;">Solutions for qualifying rental and investment properties.</div>
</td>
</tr>
</tbody></table>
<div style="height:1px;line-height:1px;font-size:0;background:#E3DED4;">&nbsp;</div>
</td>
</tr>
<tr>
<td bgcolor="#FDFCFA" class="p-lr" style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; background:#FDFCFA; padding:34px 32px 34px 32px">
<table bgcolor="#F4F0E7" border="0" cellpadding="0" cellspacing="0" role="presentation" style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; border-collapse:collapse; width:100%; background:#F4F0E7" width="100%">
<tbody><tr>
<td bgcolor="#B08C45" style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; width:4px; background:#B08C45; line-height:1px; font-size:0" width="4">&nbsp;</td>
<td style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; padding:24px 26px 24px 24px; font-family:Helvetica, Arial, sans-serif; font-size:18px; line-height:29px; mso-line-height-rule:exactly; color:#23292F">
                  Our goal is to find the right mortgage solution for your specific situation — not simply the lowest rate.
                </td>
</tr>
</tbody></table>
</td>
</tr>
<tr>
<td bgcolor="#FDFCFA" class="p-lr" style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; background:#FDFCFA; padding:0 32px 34px 32px">
<div style="font-family:Helvetica, Arial, sans-serif;font-size:15px;line-height:25px;mso-line-height-rule:exactly;color:#3F4750;padding-bottom:16px;">
              If you are considering buying a home, refinancing, purchasing a multi-unit property, investing in real estate, financing a business, or exploring private mortgage options, I would be glad to review your situation and walk through the options available to you.
            </div>
<div style="font-family:Helvetica, Arial, sans-serif;font-size:15px;line-height:25px;mso-line-height-rule:exactly;color:#3F4750;">
              As one of my valued clients, I truly appreciate your continued trust and support. If you, your family, friends, or business contacts have any mortgage or financing needs, please feel free to reach out — referrals are always greatly appreciated.
              <br/><br/>
</div>
<div style="font-family:Helvetica, Arial, sans-serif;font-size:15px;line-height:25px;mso-line-height-rule:exactly;color:#3F4750;padding-bottom:20px;">
              I look forward to reconnecting and helping with your next mortgage or financing goal.
            </div>
<div style="font-family:Helvetica, Arial, sans-serif;font-size:14px;line-height:22px;mso-line-height-rule:exactly;color:#666E78;">
              Best regards,<br/>
              Asif Jabbarov<br/>
              Mortgage Broker<br/><br/>
</div>
<table border="0" cellpadding="0" cellspacing="0" role="presentation" style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; border-collapse:collapse; width:100%; border:1px solid #E3DED4" width="100%">
<tbody><tr>
<td style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; padding:22px 24px 22px 24px">
<div style="font-family:Helvetica, Arial, sans-serif;font-size:10px;line-height:16px;mso-line-height-rule:exactly;color:#8A6A2C;letter-spacing:0.16em;padding-bottom:7px;">NEW OFFICE</div>
<div style="font-family:Helvetica, Arial, sans-serif;font-size:17px;line-height:26px;mso-line-height-rule:exactly;color:#23292F;">Unit 2 – 3000 Langstaff Rd, Vaughan ON L4K 4R7</div>
</td>
</tr>
</tbody></table>
</td>
</tr>
<tr>
</tr>
<tr>
<td bgcolor="#F4F0E7" class="p-lr" style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; background:#F4F0E7; padding:28px 32px 28px 32px">
<table border="0" cellpadding="0" cellspacing="0" role="presentation" style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; border-collapse:collapse; width:100%" width="100%">
<tbody><tr>
<td style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; width:70px; font-family:Helvetica, Arial, sans-serif; font-size:11px; line-height:22px; mso-line-height-rule:exactly; color:#6E6659; letter-spacing:0.1em" valign="top" width="70">PHONE</td>
<td style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; font-family:Helvetica, Arial, sans-serif; font-size:15px; line-height:22px; mso-line-height-rule:exactly; color:#23292F" valign="top"><a href="tel:+16474020550" style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; color:#23292F; text-decoration:none">+1 (647) 402-0550</a></td>
</tr>
<tr><td colspan="2" height="10" style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; height:10px; line-height:10px; font-size:0">&nbsp;</td></tr>
<tr>
<td style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; width:70px; font-family:Helvetica, Arial, sans-serif; font-size:11px; line-height:22px; mso-line-height-rule:exactly; color:#6E6659; letter-spacing:0.1em" valign="top" width="70">EMAIL</td>
<td style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; font-family:Helvetica, Arial, sans-serif; font-size:15px; line-height:22px; mso-line-height-rule:exactly; color:#23292F" valign="top"><a href="mailto:asifjabbarov8@gmail.com" style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; color:#23292F; text-decoration:none">asifjabbarov8@gmail.com</a></td>
</tr>
</tbody></table>
</td>
</tr>
<tr>
</tr>
<tr>
<td bgcolor="#B08C45" height="1" style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; height:1px; line-height:1px; font-size:0; background:#B08C45">&nbsp;</td>
</tr>
<tr>
<td bgcolor="#14243A" class="p-lr" style="-webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; mso-table-lspace:0; mso-table-rspace:0; background:#14243A; padding:26px 32px 28px 32px">
<div style="font-family:Helvetica, Arial, sans-serif;font-size:12px;line-height:20px;mso-line-height-rule:exactly;color:#8FA0B4;padding-bottom:12px;">
              Asif Jabbarov · Mortgage Broker · Real Mortgage Associates, License #M14000335<br/>Unit 2 – 3000 Langstaff Rd, Vaughan ON L4K 4R7
            </div>
<div style="font-family:Helvetica, Arial, sans-serif;font-size:11px;line-height:19px;mso-line-height-rule:exactly;color:#8FA3B8;padding-bottom:12px;">
              All mortgage and financing solutions are subject to lender approval, qualification, and credit review. Terms and availability may change without notice. This is not a commitment to lend.
            </div>
</td>
</tr>
</tbody></table>
</td>
</tr>
</tbody></table>
</body></html>`;
