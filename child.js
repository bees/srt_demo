const decodePayload = (input) => {
  try {
    return JSON.parse(Buffer.from(input, "base64").toString("utf8"));
  } catch (error) {
    throw new Error(
      `Failed to decode execution payload: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

const runUserCode = async (code) => {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const executor = new AsyncFunction(`
    "use strict";
    const __execute = async () => {
      ${code}
    };
    return await __execute();
  `);

  return executor();
};

const main = async () => {
  const encoded = process.argv[2];

  if (!encoded) {
    throw new Error("Missing serialized code argument");
  }

  const request = decodePayload(encoded);

  if (typeof request?.code !== "string") {
    throw new Error("Execution payload missing 'code' property");
  }

  const result = await runUserCode(request.code);

  return { status: "ok", value: result };
};

main()
  .then((response) => {
    process.stdout.write(JSON.stringify(response));
  })
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(JSON.stringify({ status: "error", error: message }));
    process.exitCode = 1;
  });
