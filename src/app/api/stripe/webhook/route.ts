import Stripe from "stripe";
import { NextResponse } from "next/server";

import { env } from "@/lib/env";

export async function POST(request: Request) {
  if (!env.stripeSecret || !env.stripeWebhookSecret) {
    return NextResponse.json({ error: "Stripe webhook is not configured" }, { status: 500 });
  }

  const stripe = new Stripe(env.stripeSecret);
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  try {
    const event = stripe.webhooks.constructEvent(payload, signature, env.stripeWebhookSecret);

    if (event.type === "checkout.session.completed") {
      // TODO: Persist paid ticket/order and decrement bookstore stock via Supabase RPC.
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid webhook";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
