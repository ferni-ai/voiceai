import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
    observe() { }
    unobserve() { }
    disconnect() { }
};

// Mock WebGL context (for Three.js)
HTMLCanvasElement.prototype.getContext = vi.fn(() => {
    return {
        getParameter: vi.fn().mockReturnValue(0),
        getExtension: vi.fn().mockReturnValue({}),
        createTexture: vi.fn(),
        bindTexture: vi.fn(),
        texParameteri: vi.fn(),
        texImage2D: vi.fn(),
        createBuffer: vi.fn(),
        bindBuffer: vi.fn(),
        bufferData: vi.fn(),
        enableVertexAttribArray: vi.fn(),
        vertexAttribPointer: vi.fn(),
        createProgram: vi.fn(),
        createShader: vi.fn(),
        shaderSource: vi.fn(),
        compileShader: vi.fn(),
        attachShader: vi.fn(),
        linkProgram: vi.fn(),
        useProgram: vi.fn(),
        getProgramParameter: vi.fn().mockReturnValue(true),
        getShaderParameter: vi.fn().mockReturnValue(true),
        clear: vi.fn(),
        clearColor: vi.fn(),
        enable: vi.fn(),
        blendFunc: vi.fn(),
        drawArrays: vi.fn(),
        viewport: vi.fn(),
    };
}) as any;
