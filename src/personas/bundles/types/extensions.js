/**
 * Extension Types
 *
 * V2 types, humanizing behaviors, advanced behavior types,
 * and Ferni 200% superhuman capabilities.
 */
export function isGoodbyesV2(goodbyes) {
    return (goodbyes !== undefined &&
        !Array.isArray(goodbyes) &&
        typeof goodbyes === 'object' &&
        'schema_version' in goodbyes &&
        goodbyes.schema_version === 2);
}
export function isEntrancesV2(entrances) {
    return (entrances !== undefined &&
        !Array.isArray(entrances) &&
        typeof entrances === 'object' &&
        'schema_version' in entrances &&
        entrances.schema_version === 2);
}
export function isGreetingsV2(greetings) {
    return (greetings !== undefined &&
        typeof greetings === 'object' &&
        'schema_version' in greetings &&
        greetings.schema_version === 2);
}
//# sourceMappingURL=extensions.js.map