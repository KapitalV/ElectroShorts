# Razorpay setup

The site supports two separate flows: a ₹4,900 one-time order and a ₹333/month recurring subscription. The annual ₹999 service-charge copy on the one-time plan is unchanged and is not part of the gateway integration.

## Configure the monthly plan

1. In Razorpay Dashboard, create a plan with billing period **Monthly**, interval **1**, and amount **₹333**. Razorpay plans are immutable; create a new plan if the amount or frequency changes.
2. Copy its Plan ID. The server uses it as `RAZORPAY_MONTHLY_PLAN_ID` and sets the subscription to 12 monthly billing cycles. The customer authorizes recurring deductions in Razorpay Checkout.
3. Add the Razorpay Test Mode Key ID and Key Secret as server environment variables. Never put the secret in HTML or JavaScript.
4. Configure a Test Mode webhook at `https://YOUR_DOMAIN/api/webhooks/razorpay`, create a separate webhook secret, and subscribe to `subscription.activated`, `subscription.charged`, `subscription.pending`, `subscription.halted`, `subscription.cancelled`, and `subscription.completed`. Set that secret as `RAZORPAY_WEBHOOK_SECRET`.

Required server environment variables:

```text
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_MONTHLY_PLAN_ID=plan_...
RAZORPAY_WEBHOOK_SECRET=...
```

The webhook verifies Razorpay's HMAC signature against the raw request body and appends verified subscription lifecycle events to `razorpay-events.jsonl`. Protect and back up that file in production; it contains payment references. The one-time purchase is verified against its Razorpay Order and captured Payment.

Before going live, test an authorized monthly checkout, one successful renewal, and a failed renewal in Razorpay Test Mode. Then switch the server variables and webhook configuration to Live Mode. Live acceptance depends on Razorpay merchant activation and recurring payment methods enabled for the account.
