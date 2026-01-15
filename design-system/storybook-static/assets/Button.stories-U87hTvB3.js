import{w as F,e as J,u as p}from"./index-CSupD1xc.js";const u=e=>{const r=document.createElement("div"),a=`
    font-family: var(--font-body, Inter, system-ui);
    font-weight: 500;
    border-radius: var(--radius-lg, 12px);
    cursor: ${e.disabled||e.loading?"not-allowed":"pointer"};
    transition: all 0.2s;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2, 8px);
    opacity: ${e.disabled?"0.5":"1"};
    ${e.loading?"pointer-events: none;":""}
  `,W={sm:"padding: var(--space-1, 4px) var(--space-3, 12px); font-size: 0.875rem;",md:"padding: var(--space-2, 8px) var(--space-4, 16px); font-size: 1rem;",lg:"padding: var(--space-3, 12px) var(--space-6, 24px); font-size: 1.125rem;"},Y={primary:`
      background: var(--persona-primary, #4a6741);
      color: white;
      border: none;
    `,secondary:`
      background: transparent;
      color: var(--color-text-primary, #2C2520);
      border: 1px solid var(--color-border, #e8e0d8);
    `,ghost:`
      background: transparent;
      color: var(--color-text-secondary, #5a4d43);
      border: none;
    `,destructive:`
      background: var(--color-error, #c45c5c);
      color: white;
      border: none;
    `},_={primary:"this.style.filter='brightness(1.1)'; this.style.transform='translateY(-1px)';",secondary:"this.style.background='var(--color-background-muted, #f5f1eb)';",ghost:"this.style.background='var(--color-background-muted, #f5f1eb)';",destructive:"this.style.filter='brightness(1.1)'; this.style.transform='translateY(-1px)';"},j={primary:"this.style.filter='none'; this.style.transform='none';",secondary:"this.style.background='transparent';",ghost:"this.style.background='transparent';",destructive:"this.style.filter='none'; this.style.transform='none';"},O=e.loading?`
    <svg class="spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite;">
      <circle cx="12" cy="12" r="10" opacity="0.25"></circle>
      <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"></path>
    </svg>
  `:"",q=e.icon&&!e.loading?e.icon:"";return r.innerHTML=`
    <button
      class="ferni-button ferni-button--${e.variant||"primary"}"
      ${e.disabled?"disabled":""}
      style="${a} ${W[e.size||"md"]} ${Y[e.variant||"primary"]}"
      ${!e.disabled&&!e.loading?`
        onmouseenter="${_[e.variant||"primary"]}"
        onmouseleave="${j[e.variant||"primary"]}"
      `:""}
    >
      ${O}
      ${q}
      ${e.label}
    </button>
    
    <style>
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    </style>
  `,r},N={title:"Components/Button",tags:["autodocs"],render:e=>u(e),argTypes:{label:{control:"text"},variant:{control:{type:"select"},options:["primary","secondary","ghost","destructive"]},size:{control:{type:"select"},options:["sm","md","lg"]},disabled:{control:"boolean"},loading:{control:"boolean"}}},n={args:{label:"Start conversation",variant:"primary",size:"md"}},t={args:{label:"Cancel",variant:"secondary",size:"md"}},s={args:{label:"Learn more",variant:"ghost",size:"md"}},o={args:{label:"Delete account",variant:"destructive",size:"md"}},i={args:{label:"Connecting...",variant:"primary",loading:!0}},c={args:{label:"Unavailable",variant:"primary",disabled:!0}},l={render:()=>{const e=document.createElement("div");return e.style.cssText="display: flex; gap: 16px; align-items: center;",["sm","md","lg"].forEach(a=>{e.appendChild(u({label:a.toUpperCase(),size:a,variant:"primary"}))}),e}},d={render:()=>{const e=document.createElement("div");return e.style.cssText="display: flex; gap: 16px; flex-wrap: wrap;",["primary","secondary","ghost","destructive"].forEach(a=>{e.appendChild(u({label:a.charAt(0).toUpperCase()+a.slice(1),variant:a}))}),e}},m={args:{label:"Click me",variant:"primary",size:"md"},play:async({canvasElement:e})=>{const a=F(e).getByRole("button");await J(a).toBeEnabled(),await p.click(a),await p.hover(a),await p.unhover(a)}};var v,y,g;n.parameters={...n.parameters,docs:{...(v=n.parameters)==null?void 0:v.docs,source:{originalSource:`{
  args: {
    label: 'Start conversation',
    variant: 'primary',
    size: 'md'
  }
}`,...(g=(y=n.parameters)==null?void 0:y.docs)==null?void 0:g.source}}};var b,h,f;t.parameters={...t.parameters,docs:{...(b=t.parameters)==null?void 0:b.docs,source:{originalSource:`{
  args: {
    label: 'Cancel',
    variant: 'secondary',
    size: 'md'
  }
}`,...(f=(h=t.parameters)==null?void 0:h.docs)==null?void 0:f.source}}};var x,z,w;s.parameters={...s.parameters,docs:{...(x=s.parameters)==null?void 0:x.docs,source:{originalSource:`{
  args: {
    label: 'Learn more',
    variant: 'ghost',
    size: 'md'
  }
}`,...(w=(z=s.parameters)==null?void 0:z.docs)==null?void 0:w.source}}};var S,k,C;o.parameters={...o.parameters,docs:{...(S=o.parameters)==null?void 0:S.docs,source:{originalSource:`{
  args: {
    label: 'Delete account',
    variant: 'destructive',
    size: 'md'
  }
}`,...(C=(k=o.parameters)==null?void 0:k.docs)==null?void 0:C.source}}};var E,$,B;i.parameters={...i.parameters,docs:{...(E=i.parameters)==null?void 0:E.docs,source:{originalSource:`{
  args: {
    label: 'Connecting...',
    variant: 'primary',
    loading: true
  }
}`,...(B=($=i.parameters)==null?void 0:$.docs)==null?void 0:B.source}}};var U,A,D;c.parameters={...c.parameters,docs:{...(U=c.parameters)==null?void 0:U.docs,source:{originalSource:`{
  args: {
    label: 'Unavailable',
    variant: 'primary',
    disabled: true
  }
}`,...(D=(A=c.parameters)==null?void 0:A.docs)==null?void 0:D.source}}};var T,L,H;l.parameters={...l.parameters,docs:{...(T=l.parameters)==null?void 0:T.docs,source:{originalSource:`{
  render: () => {
    const container = document.createElement('div');
    container.style.cssText = 'display: flex; gap: 16px; align-items: center;';
    const sizes: Array<'sm' | 'md' | 'lg'> = ['sm', 'md', 'lg'];
    sizes.forEach(size => {
      container.appendChild(createButton({
        label: size.toUpperCase(),
        size,
        variant: 'primary'
      }));
    });
    return container;
  }
}`,...(H=(L=l.parameters)==null?void 0:L.docs)==null?void 0:H.source}}};var I,R,V;d.parameters={...d.parameters,docs:{...(I=d.parameters)==null?void 0:I.docs,source:{originalSource:`{
  render: () => {
    const container = document.createElement('div');
    container.style.cssText = 'display: flex; gap: 16px; flex-wrap: wrap;';
    const variants: Array<'primary' | 'secondary' | 'ghost' | 'destructive'> = ['primary', 'secondary', 'ghost', 'destructive'];
    variants.forEach(variant => {
      container.appendChild(createButton({
        label: variant.charAt(0).toUpperCase() + variant.slice(1),
        variant
      }));
    });
    return container;
  }
}`,...(V=(R=d.parameters)==null?void 0:R.docs)==null?void 0:V.source}}};var G,M,P;m.parameters={...m.parameters,docs:{...(G=m.parameters)==null?void 0:G.docs,source:{originalSource:`{
  args: {
    label: 'Click me',
    variant: 'primary',
    size: 'md'
  },
  play: async ({
    canvasElement
  }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole('button');

    // Verify button exists and is enabled
    await expect(button).toBeEnabled();

    // Click the button
    await userEvent.click(button);

    // Hover over button
    await userEvent.hover(button);

    // Unhover
    await userEvent.unhover(button);
  }
}`,...(P=(M=m.parameters)==null?void 0:M.docs)==null?void 0:P.source}}};const Q=["Primary","Secondary","Ghost","Destructive","Loading","Disabled","Sizes","AllVariants","WithInteraction"];export{d as AllVariants,o as Destructive,c as Disabled,s as Ghost,i as Loading,n as Primary,t as Secondary,l as Sizes,m as WithInteraction,Q as __namedExportsOrder,N as default};
