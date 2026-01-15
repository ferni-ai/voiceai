const w={xs:{size:16,stroke:2},sm:{size:24,stroke:2.5},md:{size:32,stroke:3},lg:{size:48,stroke:3.5},xl:{size:64,stroke:4}},A={ferni:"#4a6741",peter:"#3a6b73",alex:"#5a6b8a",maya:"#a67a6a",jordan:"#c4856a",nayan:"#b8956a"},c=n=>{const r=document.createElement("div"),s=n.size||"md",e=w[s],t=n.persona?A[n.persona]:"#4a6741",p=(e.size-e.stroke)/2,d=p*2*Math.PI;return r.innerHTML=`
    <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
      <svg
        width="${e.size}"
        height="${e.size}"
        viewBox="0 0 ${e.size} ${e.size}"
        style="animation: spin 1s linear infinite;"
      >
        <circle
          cx="${e.size/2}"
          cy="${e.size/2}"
          r="${p}"
          fill="none"
          stroke="${t}"
          stroke-width="${e.stroke}"
          stroke-linecap="round"
          style="
            stroke-dasharray: ${d};
            stroke-dashoffset: ${d*.75};
          "
        />
      </svg>
      ${n.label?`
        <span style="
          font-family: Inter, system-ui, sans-serif;
          font-size: 14px;
          color: #5C544A;
        ">${n.label}</span>
      `:""}
    </div>
    
    <style>
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    </style>
  `,r},k={title:"Components/Spinner",tags:["autodocs"],render:n=>c(n),argTypes:{size:{control:{type:"select"},options:["xs","sm","md","lg","xl"]},persona:{control:{type:"select"},options:["ferni","peter","alex","maya","jordan","nayan"]}}},a={args:{size:"md"}},o={args:{size:"lg",label:"Loading..."}},i={render:()=>{const n=document.createElement("div");return n.style.cssText="display: flex; gap: 24px; align-items: flex-end;",["xs","sm","md","lg","xl"].forEach(s=>{const e=document.createElement("div");e.style.textAlign="center",e.appendChild(c({size:s}));const t=document.createElement("div");t.style.cssText="font-size: 12px; color: #8A847A; margin-top: 8px;",t.textContent=s.toUpperCase(),e.appendChild(t),n.appendChild(e)}),n}},l={render:()=>{const n=document.createElement("div");return n.style.cssText="display: flex; gap: 24px;",["ferni","peter","alex","maya","jordan","nayan"].forEach(s=>{const e=document.createElement("div");e.style.textAlign="center",e.appendChild(c({size:"lg",persona:s}));const t=document.createElement("div");t.style.cssText="font-size: 12px; color: #8A847A; margin-top: 8px; text-transform: capitalize;",t.textContent=s,e.appendChild(t),n.appendChild(e)}),n}};var m,x,g;a.parameters={...a.parameters,docs:{...(m=a.parameters)==null?void 0:m.docs,source:{originalSource:`{
  args: {
    size: 'md'
  }
}`,...(g=(x=a.parameters)==null?void 0:x.docs)==null?void 0:g.source}}};var y,f,u;o.parameters={...o.parameters,docs:{...(y=o.parameters)==null?void 0:y.docs,source:{originalSource:`{
  args: {
    size: 'lg',
    label: 'Loading...'
  }
}`,...(u=(f=o.parameters)==null?void 0:f.docs)==null?void 0:u.source}}};var z,h,C;i.parameters={...i.parameters,docs:{...(z=i.parameters)==null?void 0:z.docs,source:{originalSource:`{
  render: () => {
    const container = document.createElement('div');
    container.style.cssText = 'display: flex; gap: 24px; align-items: flex-end;';
    const sizes: Array<'xs' | 'sm' | 'md' | 'lg' | 'xl'> = ['xs', 'sm', 'md', 'lg', 'xl'];
    sizes.forEach(size => {
      const wrapper = document.createElement('div');
      wrapper.style.textAlign = 'center';
      wrapper.appendChild(createSpinner({
        size
      }));
      const label = document.createElement('div');
      label.style.cssText = 'font-size: 12px; color: #8A847A; margin-top: 8px;';
      label.textContent = size.toUpperCase();
      wrapper.appendChild(label);
      container.appendChild(wrapper);
    });
    return container;
  }
}`,...(C=(h=i.parameters)==null?void 0:h.docs)==null?void 0:C.source}}};var E,b,v;l.parameters={...l.parameters,docs:{...(E=l.parameters)==null?void 0:E.docs,source:{originalSource:`{
  render: () => {
    const container = document.createElement('div');
    container.style.cssText = 'display: flex; gap: 24px;';
    const personas = ['ferni', 'peter', 'alex', 'maya', 'jordan', 'nayan'];
    personas.forEach(persona => {
      const wrapper = document.createElement('div');
      wrapper.style.textAlign = 'center';
      wrapper.appendChild(createSpinner({
        size: 'lg',
        persona
      }));
      const label = document.createElement('div');
      label.style.cssText = 'font-size: 12px; color: #8A847A; margin-top: 8px; text-transform: capitalize;';
      label.textContent = persona;
      wrapper.appendChild(label);
      container.appendChild(wrapper);
    });
    return container;
  }
}`,...(v=(b=l.parameters)==null?void 0:b.docs)==null?void 0:v.source}}};const S=["Default","WithLabel","Sizes","Personas"];export{a as Default,l as Personas,i as Sizes,o as WithLabel,S as __namedExportsOrder,k as default};
