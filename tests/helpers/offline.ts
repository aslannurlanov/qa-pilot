// All Vitest cases are offline. Adapters must inject their own mocked fetch.
process.env.AI_PROVIDER = "fake";
delete process.env.OPENAI_API_KEY;
globalThis.fetch = async () => { throw new Error("Live network fetch is forbidden in tests."); };
