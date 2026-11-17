import Stripe from "stripe";
import { NextResponse } from "next/server";

import { env } from "@/lib/env";

export async function POST(request: Request) {
  try {
    if (!env.stripeSecret) {
      return NextResponse.json({ error: "Stripe is not configured" }, { status: 500 });
    }

    const stripe = new Stripe(env.stripeSecret);
    const body = (await request.json()) as {
      lineItems?: Array<{ name: string; amount: number; quantity: number }>;
    };

    if (!body.lineItems || body.lineItems.length === 0) {
      return NextResponse.json({ error: "lineItems is required" }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: `${env.appUrl ?? "http://localhost:3000"}/?checkout=success`,
      cancel_url: `${env.appUrl ?? "http://localhost:3000"}/?checkout=cancel`,
      line_items: body.lineItems.map((item) => ({
        quantity: item.quantity,
        price_data: {
          currency: "usd",
          unit_amount: item.amount,
          product_data: { name: item.name },
        },
      })),
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
