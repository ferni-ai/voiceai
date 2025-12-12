export async function run(params, context) {
  return {
    ok: true,
    params,
    context: {
      userId: context.userId,
      sessionId: context.sessionId,
      personaId: context.personaId,
      toolId: context.tool?.id,
    },
  };
}
