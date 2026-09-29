import type { GeneratedTestPlan, TaskInput } from "@/domain/schemas";

export const usernameTask = {
  title: "Validate username length on registration",
  description: "On registration, accept usernames containing 3 to 20 ASCII letters or digits. Reject invalid values with a visible validation message and do not create an account. Existing users must still be able to sign in.",
} satisfies TaskInput;

// Generic synthetic data only. The fake returns this same scenario for every task.
export const usernamePlan = {
  summary: "Validate a 3–20 character alphanumeric username during registration and preserve existing sign-in behavior.",
  risks: [
    "Length validation may reject the inclusive minimum or maximum.",
    "Invalid registration attempts may create an account despite showing an error.",
    "Shared validation changes may break sign-in for existing users.",
  ],
  questions: ["Should leading and trailing whitespace be trimmed or rejected?"],
  metadata: { schemaVersion: "1", promptVersion: "fixture-v1", provider: "fake", model: "username-fixture-v1" },
  checks: [
    {
      id: "username-positive", position: 0, type: "positive",
      title: "Register with a valid username",
      steps: ["Open registration with otherwise valid, unique account details.", "Enter pilot123 as the username and submit.", "Verify registration succeeds and the new account can sign in."],
      testData: ["Username: pilot123", "Use a fresh test account and valid values for other required fields."],
      expectedResult: "Registration succeeds and the account can sign in with pilot123.",
      reason: "The requirement allows usernames of 3–20 ASCII letters or digits.",
      basis: "requirement", excludedAt: null,
    },
    {
      id: "username-negative", position: 1, type: "negative",
      title: "Reject usernames containing punctuation",
      steps: ["Open registration with otherwise valid account details.", "Enter pilot! as the username and submit.", "Verify a validation message appears and no account is created."],
      testData: ["Username: pilot!"],
      expectedResult: "Registration is rejected with a visible validation message and no account is created.",
      reason: "Only ASCII letters and digits are allowed, so punctuation must be rejected.",
      basis: "requirement", excludedAt: null,
    },
    {
      id: "username-boundary", position: 2, type: "boundary",
      title: "Enforce inclusive username length boundaries",
      steps: ["Attempt registration separately with each listed username, using fresh valid account details each time.", "Record acceptance or rejection for lengths 2, 3, 20, and 21.", "Verify rejected attempts show a message and create no account."],
      testData: ["2 characters: ab", "3 characters: abc", "20 characters: abcdefghijklmnopqrst", "21 characters: abcdefghijklmnopqrstu"],
      expectedResult: "Lengths 3 and 20 are accepted. Lengths 2 and 21 are rejected with no account created.",
      reason: "The stated 3–20 character interval has inclusive endpoints; adjacent values detect off-by-one errors.",
      basis: "requirement", excludedAt: null,
    },
    {
      id: "username-regression", position: 3, type: "regression",
      title: "Existing users can still sign in",
      steps: ["Use a test account created before the validation change.", "Open sign-in and submit its valid credentials.", "Verify the account reaches its signed-in page."],
      testData: ["Existing synthetic account: existingqa", "Use the valid password configured for that test account."],
      expectedResult: "The existing account signs in successfully.",
      reason: "The requirement explicitly preserves sign-in for existing users.",
      basis: "requirement", excludedAt: null,
    },
  ],
} satisfies GeneratedTestPlan;
