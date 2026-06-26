# Payout Path — Getting Paid in Sri Lanka

> Who this is for: **Damika**, a solo developer based in Sri Lanka, selling a digital product (resume-jd-matcher) and wanting Gumroad sales to land in a **Sri Lankan bank account (LKR)**.
>
> ⚠️ **Verify before relying on this.** Fees, country support, and PayPal/Stripe availability change often. Confirm every number on the provider's own site (Gumroad payout settings, Payoneer, Wise) before committing. Figures below reflect typical 2026 realities and are indicative, not guarantees.

---

## The core problem

Gumroad does **not** pay out directly to most Sri Lankan banks. Gumroad's payout rails are:

1. **Direct bank deposit (via Stripe)** — only in Stripe-supported countries. **Sri Lanka is not on Stripe's supported payout list**, so this is generally unavailable.
2. **PayPal** — available in many countries, **but PayPal in Sri Lanka can typically *send* but not *receive*** money. So a plain Sri Lankan PayPal account usually can't collect Gumroad earnings either.

**Conclusion:** Damika needs an intermediary that gives him **receiving account details in a supported currency (USD/EUR/GBP)** that Gumroad/PayPal *can* pay into, and which then lets him **withdraw to his Sri Lankan bank in LKR**. That's exactly what **Payoneer** and **Wise** do.

The realistic chain is:

```
Gumroad  →  PayPal (linked to a receiving account)  →  LKR bank
              OR
Gumroad  →  Payoneer / Wise receiving account  →  LKR bank
```

> Note: Gumroad's primary non-Stripe method is PayPal. Payoneer integration with Gumroad has historically been limited/region-dependent — **confirm in your Gumroad "Settings → Payments" whether Payoneer is offered for Sri Lanka.** If only PayPal is offered, the intermediary's job is to be the bank account your PayPal withdraws to.

---

## Option A — Payoneer

**What it gives you:** "Receiving accounts" — your own USD (US), EUR, GBP, etc. account numbers. You can withdraw the balance to a Sri Lankan bank in LKR.

**How it fits Gumroad:**
- If Gumroad offers Payoneer directly for SL → connect it as your payout method.
- If not → use Payoneer's USD receiving account as the destination your **PayPal** withdraws to, or receive from marketplaces that support Payoneer.

**Indicative fees (verify on payoneer.com):**
- Account: free to open; sometimes a small annual fee if activity is very low.
- Receiving from another Payoneer account: free.
- Receiving via your USD/EUR receiving accounts (ACH/bank): often free or ~1%.
- **Withdrawal to local (LKR) bank:** typically a fixed-ish fee (often around **US$1.50–3 per withdrawal**) plus an FX margin on USD→LKR conversion (commonly **~2%**, sometimes more).
- Card (if you take the Payoneer Mastercard): annual fee + ATM fees.

**Setup needs:**
- Government ID (NIC or passport), proof of address.
- Sri Lankan bank account details (account number, branch, bank SWIFT for some flows).
- Tax/personal details for KYC.
- Approval can take a few business days.

**Strengths:** Long-established in Sri Lanka, widely supported by freelancer/marketplace platforms, mature local-bank withdrawal, USD card option.
**Weaknesses:** FX margin tends to be worse than Wise; some low-activity/maintenance fees; UX dated.

---

## Option B — Wise (formerly TransferWise)

**What it gives you:** Multi-currency account with **local receiving details** in USD, GBP, EUR, AUD, and more. You hold balances in those currencies and convert to LKR for withdrawal.

**How it fits Gumroad:**
- Gumroad does not have native Wise payout, so Wise typically functions as the **bank account your PayPal (or a USD wire) pays into**, or you receive USD into your Wise USD account details.
- ⚠️ **Important caveat:** Wise has historically had **limited support for sending/receiving to Sri Lankan accounts and for SL residents opening accounts** depending on regulation. **Verify current Sri Lanka eligibility on wise.com before relying on this** — availability for SL has fluctuated.

**Indicative fees (verify on wise.com):**
- Account: free to open; one-time small fee (~US$20-ish) only if you order the physical debit card.
- Receiving USD via ACH: often free; via wire may carry a small fixed fee.
- **Currency conversion:** Wise's main strength — the **mid-market rate + a low transparent fee (commonly ~0.4–0.7%)**. Usually cheaper than Payoneer's FX margin.
- Withdrawal/transfer to a bank: small transfer fee shown upfront.

**Setup needs:**
- Government ID + selfie verification.
- Proof of address.
- Confirmation that SL residency is currently supported (this is the key risk).

**Strengths:** Cheapest, most transparent FX; great UX; excellent for holding USD and converting only when the rate is good.
**Weaknesses:** **Sri Lanka eligibility is the open question** — both for opening an account as an SL resident and for withdrawing to SL banks. Must be confirmed live.

---

## Side-by-side

| Factor | Payoneer | Wise |
|---|---|---|
| SL availability | Well-established for SL freelancers | **Must verify — historically limited for SL** |
| Receiving accounts | USD/EUR/GBP etc. | USD/GBP/EUR/AUD etc. |
| FX margin (USD→LKR) | ~2% (less transparent) | ~0.4–0.7% (mid-market + fee) |
| Withdrawal to LKR bank | ~US$1.50–3 + FX | Small upfront fee + best FX |
| Low-activity fees | Possible annual fee | Generally none (except card) |
| Marketplace integration | Broad (incl. some Gumroad-style flows) | Narrower; acts as a bank destination |
| Best at | Reliable SL withdrawals, USD card | Cheapest conversion, holding USD |

---

## Recommended path

**Primary recommendation: Payoneer as the reliable backbone, with Wise as a cost-optimizer if (and only if) it's currently available for Sri Lanka.**

Concrete steps:

1. **Open the Gumroad payout settings first** and read exactly which methods are offered for a Sri Lanka-based seller (PayPal? Payoneer? bank?). Everything downstream depends on this. *(Verify in-app.)*
2. **Set up Payoneer** as the dependable receiving + LKR-withdrawal layer. It's the most proven route for Sri Lanka and unlikely to surprise you on eligibility.
3. If Gumroad pays via **PayPal**, link a Sri Lankan PayPal and point its withdrawals at the Payoneer/local route that works for you — confirm PayPal-SL receiving/withdrawal limits at signup, since these have historically been the pinch point.
4. **Check Wise eligibility for Sri Lanka.** If Wise currently supports SL residents and LKR withdrawal, route the *currency conversion* through Wise to capture the better FX rate — hold USD, convert to LKR when the rate is favorable. Treat Wise as the savings optimizer, Payoneer as the guaranteed rail.
5. **Keep records** of every fee and FX rate for the first few payouts so you can measure the real effective cost and pick the cheaper rail going forward.

**Bottom line:** Don't depend on a single provider being available. Stand up **Payoneer as the dependable path today**, and **layer Wise in for cheaper conversion only after confirming live SL support**. Re-verify all fees and country availability on each provider's own site before your first real payout — this space changes frequently and SL is a regulatory edge case.
