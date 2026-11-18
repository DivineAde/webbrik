# ADR-0018: Billing extras
Status: accepted. Team plan, tax (added last), upgrade proration `(team-pro) * remaining`, coupons, invoice PDFs (pdfkit). Coupon/upgrade purchases are one-off charges without a Paystack plan, so don't auto-renew. Settlement compares the Paystack amount to the stored payment total. Coupons are managed via admin API for `ADMIN_EMAILS`.
