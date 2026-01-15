const p={ferni:{primary:"#4a6741",secondary:"#3d5a35"},peter:{primary:"#3a6b73",secondary:"#2d5359"},alex:{primary:"#5a6b8a",secondary:"#4a5a73"},maya:{primary:"#a67a6a",secondary:"#8a635a"},jordan:{primary:"#c4856a",secondary:"#a86d55"},nayan:{primary:"#b8956a",secondary:"#9a7a52"}},C={sm:{size:32,font:12,status:8},md:{size:48,font:16,status:12},lg:{size:64,font:20,status:14},xl:{size:96,font:28,status:18}},d=e=>{const a=document.createElement("div"),n=C[e.size||"md"],c=e.personaId?p[e.personaId]||p.ferni:{primary:"#7a6f63",secondary:"#5a4d43"},$=e.name.split(" ").map(F=>F[0]).join("").toUpperCase().slice(0,2),E={online:"#4a6741",speaking:"#c4856a",listening:"#3a6b73",offline:"#9a8b7a"};return a.innerHTML=`
    <div class="ferni-avatar" style="
      position: relative;
      display: inline-flex;
      ${e.status==="speaking"?"animation: pulse 1.5s ease-in-out infinite;":""}
    ">
      <div style="
        width: ${n.size}px;
        height: ${n.size}px;
        border-radius: 50%;
        background: linear-gradient(135deg, ${c.primary}, ${c.secondary});
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-family: var(--font-display, 'Plus Jakarta Sans', system-ui);
        font-weight: 600;
        font-size: ${n.font}px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        ${e.status==="speaking"?`
          box-shadow: 0 0 0 3px white, 0 0 0 5px ${c.primary};
        `:""}
      ">
        ${$}
      </div>
      
      ${e.showStatus&&e.status?`
        <div style="
          position: absolute;
          bottom: 0;
          right: 0;
          width: ${n.status}px;
          height: ${n.status}px;
          border-radius: 50%;
          background: ${E[e.status]};
          border: 2px solid white;
          ${e.status==="speaking"?"animation: statusPulse 1s ease-in-out infinite;":""}
        "></div>
      `:""}
    </div>
    
    <style>
      @keyframes pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.05); }
      }
      
      @keyframes statusPulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.6; }
      }
    </style>
  `,a},T={title:"Components/Avatar",tags:["autodocs"],render:e=>d(e),argTypes:{name:{control:"text"},personaId:{control:{type:"select"},options:["ferni","peter","alex","maya","jordan","nayan"]},size:{control:{type:"select"},options:["sm","md","lg","xl"]},showStatus:{control:"boolean"},status:{control:{type:"select"},options:["online","speaking","listening","offline"]}}},s={args:{name:"Ferni",personaId:"ferni",size:"md"}},t={args:{name:"Ferni",personaId:"ferni",size:"lg",showStatus:!0,status:"online"}},r={args:{name:"Ferni",personaId:"ferni",size:"xl",showStatus:!0,status:"speaking"}},o={render:()=>{const e=document.createElement("div");return e.style.cssText="display: flex; gap: 16px; flex-wrap: wrap; align-items: center;",[{name:"Ferni",personaId:"ferni"},{name:"Peter",personaId:"peter"},{name:"Alex",personaId:"alex"},{name:"Maya",personaId:"maya"},{name:"Jordan",personaId:"jordan"},{name:"Nayan",personaId:"nayan"}].forEach(n=>{e.appendChild(d({...n,size:"lg",showStatus:!0,status:"online"}))}),e}},i={render:()=>{const e=document.createElement("div");return e.style.cssText="display: flex; gap: 16px; align-items: center;",["sm","md","lg","xl"].forEach(n=>{e.appendChild(d({name:"Ferni",personaId:"ferni",size:n}))}),e}};var l,m,u;s.parameters={...s.parameters,docs:{...(l=s.parameters)==null?void 0:l.docs,source:{originalSource:`{
  args: {
    name: 'Ferni',
    personaId: 'ferni',
    size: 'md'
  }
}`,...(u=(m=s.parameters)==null?void 0:m.docs)==null?void 0:u.source}}};var y,g,f;t.parameters={...t.parameters,docs:{...(y=t.parameters)==null?void 0:y.docs,source:{originalSource:`{
  args: {
    name: 'Ferni',
    personaId: 'ferni',
    size: 'lg',
    showStatus: true,
    status: 'online'
  }
}`,...(f=(g=t.parameters)==null?void 0:g.docs)==null?void 0:f.source}}};var x,h,z;r.parameters={...r.parameters,docs:{...(x=r.parameters)==null?void 0:x.docs,source:{originalSource:`{
  args: {
    name: 'Ferni',
    personaId: 'ferni',
    size: 'xl',
    showStatus: true,
    status: 'speaking'
  }
}`,...(z=(h=r.parameters)==null?void 0:h.docs)==null?void 0:z.source}}};var I,S,v;o.parameters={...o.parameters,docs:{...(I=o.parameters)==null?void 0:I.docs,source:{originalSource:`{
  render: () => {
    const container = document.createElement('div');
    container.style.cssText = 'display: flex; gap: 16px; flex-wrap: wrap; align-items: center;';

    // The 6 active Ferni personas (jack is legacy, not an active persona)
    const personas = [{
      name: 'Ferni',
      personaId: 'ferni'
    }, {
      name: 'Peter',
      personaId: 'peter'
    }, {
      name: 'Alex',
      personaId: 'alex'
    }, {
      name: 'Maya',
      personaId: 'maya'
    }, {
      name: 'Jordan',
      personaId: 'jordan'
    }, {
      name: 'Nayan',
      personaId: 'nayan'
    }];
    personas.forEach(p => {
      container.appendChild(createAvatar({
        ...p,
        size: 'lg',
        showStatus: true,
        status: 'online'
      }));
    });
    return container;
  }
}`,...(v=(S=o.parameters)==null?void 0:S.docs)==null?void 0:v.source}}};var w,b,k;i.parameters={...i.parameters,docs:{...(w=i.parameters)==null?void 0:w.docs,source:{originalSource:`{
  render: () => {
    const container = document.createElement('div');
    container.style.cssText = 'display: flex; gap: 16px; align-items: center;';
    const sizes: Array<'sm' | 'md' | 'lg' | 'xl'> = ['sm', 'md', 'lg', 'xl'];
    sizes.forEach(size => {
      container.appendChild(createAvatar({
        name: 'Ferni',
        personaId: 'ferni',
        size
      }));
    });
    return container;
  }
}`,...(k=(b=i.parameters)==null?void 0:b.docs)==null?void 0:k.source}}};const A=["Default","WithStatus","Speaking","TeamMembers","Sizes"];export{s as Default,i as Sizes,r as Speaking,o as TeamMembers,t as WithStatus,A as __namedExportsOrder,T as default};
