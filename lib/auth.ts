import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma";
import { sendEmail } from "./email";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "mysql",
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  emailAndPassword: {
    enabled: true,
    // Default: required in production, skipped in dev (no mail server).
    // AUTH_REQUIRE_EMAIL_VERIFICATION=true|false overrides in any environment.
    requireEmailVerification:
      process.env.AUTH_REQUIRE_EMAIL_VERIFICATION === "true" ||
      (process.env.AUTH_REQUIRE_EMAIL_VERIFICATION !== "false" &&
        process.env.NODE_ENV === "production"),
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Reset your Coledia Controlcenter password",
        html: `<p>Hi${user.name ? ` ${user.name}` : ""},</p>
<p>Click the link below to reset your Controlcenter password. The link expires in 1 hour.</p>
<p><a href="${url}">Reset password</a></p>
<p>If you didn't request this, you can ignore this email.</p>`,
        text: `Reset your password: ${url}`,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Verify your Coledia Controlcenter email address",
        html: `<p>Hi${user.name ? ` ${user.name}` : ""},</p>
<p>Welcome to the Coledia Controlcenter! Click the link below to verify your email address.</p>
<p><a href="${url}">Verify email address</a></p>
<p>If you didn't create an account, you can ignore this email.</p>`,
        text: `Verify your email address: ${url}`,
      });
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "customer",
        input: false,
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
