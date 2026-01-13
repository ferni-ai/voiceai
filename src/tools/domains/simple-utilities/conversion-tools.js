/**
 * Unit Conversion Utilities
 *
 * Convert between units of measurement and temperature.
 *
 * @module simple-utilities/conversion-tools
 */
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getToolDescription } from '../../utils/tool-descriptions.js';
const convertUnitsDef = {
    id: 'convertUnits',
    name: 'Convert Units',
    description: 'Convert between common units of measurement',
    domain: 'simple-utilities',
    tags: ['conversion', 'units', 'measurement', 'cooking'],
    create: (_ctx) => {
        return llm.tool({
            description: getToolDescription('convertUnits'),
            parameters: z.object({
                value: z.number().describe('The value to convert'),
                fromUnit: z.string().describe('The unit to convert from'),
                toUnit: z.string().describe('The unit to convert to'),
            }),
            execute: async ({ value, fromUnit, toUnit }) => {
                const from = fromUnit.toLowerCase().replace(/s$/, ''); // Normalize plurals
                const to = toUnit.toLowerCase().replace(/s$/, '');
                // Conversion factors to base units
                const conversions = {
                    // Volume (base: ml)
                    volume: {
                        ml: 1,
                        milliliter: 1,
                        l: 1000,
                        liter: 1000,
                        cup: 236.588,
                        tbsp: 14.787,
                        tablespoon: 14.787,
                        tsp: 4.929,
                        teaspoon: 4.929,
                        'fl oz': 29.574,
                        'fluid ounce': 29.574,
                        pint: 473.176,
                        quart: 946.353,
                        gallon: 3785.41,
                    },
                    // Weight (base: gram)
                    weight: {
                        g: 1,
                        gram: 1,
                        kg: 1000,
                        kilogram: 1000,
                        oz: 28.3495,
                        ounce: 28.3495,
                        lb: 453.592,
                        pound: 453.592,
                        mg: 0.001,
                        milligram: 0.001,
                    },
                    // Length (base: meter)
                    length: {
                        m: 1,
                        meter: 1,
                        km: 1000,
                        kilometer: 1000,
                        cm: 0.01,
                        centimeter: 0.01,
                        mm: 0.001,
                        millimeter: 0.001,
                        mi: 1609.34,
                        mile: 1609.34,
                        ft: 0.3048,
                        foot: 0.3048,
                        feet: 0.3048,
                        in: 0.0254,
                        inch: 0.0254,
                        yd: 0.9144,
                        yard: 0.9144,
                    },
                };
                // Find which category the units belong to
                for (const [_category, units] of Object.entries(conversions)) {
                    if (from in units && to in units) {
                        const baseValue = value * units[from];
                        const result = baseValue / units[to];
                        // Format result nicely
                        const formatted = result < 0.01 || result > 10000
                            ? result.toExponential(2)
                            : result.toFixed(result < 1 ? 3 : 2).replace(/\.?0+$/, '');
                        return `${value} ${fromUnit} = **${formatted} ${toUnit}**`;
                    }
                }
                return `I don't know how to convert ${fromUnit} to ${toUnit}. I can help with volume (cups, ml, liters), weight (oz, grams, pounds), and length (miles, km, feet).`;
            },
        });
    },
};
const convertTemperatureDef = {
    id: 'convertTemperature',
    name: 'Convert Temperature',
    description: 'Convert between Fahrenheit and Celsius',
    domain: 'simple-utilities',
    tags: ['conversion', 'temperature', 'weather'],
    create: (_ctx) => {
        return llm.tool({
            description: getToolDescription('convertTemperature'),
            parameters: z.object({
                temperature: z.number().describe('The temperature value'),
                fromScale: z
                    .enum(['F', 'C', 'fahrenheit', 'celsius'])
                    .describe('The scale to convert from'),
            }),
            execute: async ({ temperature, fromScale }) => {
                const isFahrenheit = fromScale.toLowerCase().startsWith('f');
                if (isFahrenheit) {
                    const celsius = ((temperature - 32) * 5) / 9;
                    let context = '';
                    // Add contextual info
                    if (temperature < 32)
                        context = ' (below freezing)';
                    else if (temperature >= 68 && temperature <= 72)
                        context = ' (room temperature)';
                    else if (temperature >= 98 && temperature <= 99)
                        context = ' (normal body temp)';
                    else if (temperature >= 100)
                        context = ' (fever range)';
                    else if (temperature >= 90)
                        context = ' (hot day)';
                    return `${temperature}°F = **${celsius.toFixed(1)}°C**${context}`;
                }
                else {
                    const fahrenheit = (temperature * 9) / 5 + 32;
                    let context = '';
                    // Add contextual info
                    if (temperature < 0)
                        context = ' (below freezing)';
                    else if (temperature >= 20 && temperature <= 22)
                        context = ' (room temperature)';
                    else if (temperature >= 36.5 && temperature <= 37.5)
                        context = ' (normal body temp)';
                    else if (temperature >= 38)
                        context = ' (fever range)';
                    else if (temperature >= 32)
                        context = ' (hot day)';
                    return `${temperature}°C = **${fahrenheit.toFixed(1)}°F**${context}`;
                }
            },
        });
    },
};
// ============================================================================
// EXPORTS
// ============================================================================
export const conversionToolDefinitions = [convertUnitsDef, convertTemperatureDef];
export { convertUnitsDef, convertTemperatureDef };
//# sourceMappingURL=conversion-tools.js.map