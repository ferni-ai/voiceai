const R={sm:{padding:"8px 12px",fontSize:"14px",height:"36px"},md:{padding:"10px 14px",fontSize:"15px",height:"44px"},lg:{padding:"12px 16px",fontSize:"16px",height:"52px"}},P=e=>{const d=document.createElement("div"),r=e.size||"md",c=R[r];let p="rgba(44, 37, 32, 0.15)",m="#8A847A";return e.error?(p="#a05454",m="#a05454"):e.success&&(p="#4a6741",m="#4a6741"),d.innerHTML=`
    <div style="width: 300px;">
      ${e.label?`
        <label style="
          display: block;
          margin-bottom: 6px;
          font-family: Inter, system-ui, sans-serif;
          font-size: 14px;
          font-weight: 500;
          color: #2C2520;
        ">${e.label}${e.required?" *":""}</label>
      `:""}
      
      <input
        type="${e.type||"text"}"
        placeholder="${e.placeholder||""}"
        ${e.disabled?"disabled":""}
        ${e.required?"required":""}
        style="
          width: 100%;
          padding: ${c.padding};
          font-family: Inter, system-ui, sans-serif;
          font-size: ${c.fontSize};
          color: #2C2520;
          background: #FFFFFF;
          border: 1px solid ${p};
          border-radius: 8px;
          outline: none;
          box-sizing: border-box;
          height: ${c.height};
          opacity: ${e.disabled?"0.6":"1"};
          cursor: ${e.disabled?"not-allowed":"text"};
        "
      />
      
      ${e.error||e.success||e.helperText?`
        <span style="
          display: block;
          margin-top: 6px;
          font-family: Inter, system-ui, sans-serif;
          font-size: 13px;
          color: ${m};
        ">${e.error||e.success||e.helperText}</span>
      `:""}
    </div>
  `,d},k={title:"Components/Input",tags:["autodocs"],render:e=>P(e),argTypes:{size:{control:{type:"select"},options:["sm","md","lg"]},type:{control:{type:"select"},options:["text","email","password","search","tel","url"]},disabled:{control:"boolean"},required:{control:"boolean"}}},a={args:{label:"Email",placeholder:"Enter your email",size:"md"}},s={args:{label:"Password",type:"password",placeholder:"Enter password",helperText:"Must be at least 8 characters"}},t={args:{label:"Email",placeholder:"Enter your email",error:"Please enter a valid email address"}},n={args:{label:"Username",placeholder:"Choose a username",success:"Username is available!"}},l={args:{label:"Disabled Input",placeholder:"Cannot edit",disabled:!0}},o={args:{label:"Required Field",placeholder:"This field is required",required:!0}},i={render:()=>{const e=document.createElement("div");return e.style.cssText="display: flex; flex-direction: column; gap: 16px;",["sm","md","lg"].forEach(r=>{e.appendChild(P({label:`Size: ${r.toUpperCase()}`,placeholder:"Enter text",size:r}))}),e}};var u,h,b;a.parameters={...a.parameters,docs:{...(u=a.parameters)==null?void 0:u.docs,source:{originalSource:`{
  args: {
    label: 'Email',
    placeholder: 'Enter your email',
    size: 'md'
  }
}`,...(b=(h=a.parameters)==null?void 0:h.docs)==null?void 0:b.source}}};var g,x,f;s.parameters={...s.parameters,docs:{...(g=s.parameters)==null?void 0:g.docs,source:{originalSource:`{
  args: {
    label: 'Password',
    type: 'password',
    placeholder: 'Enter password',
    helperText: 'Must be at least 8 characters'
  }
}`,...(f=(x=s.parameters)==null?void 0:x.docs)==null?void 0:f.source}}};var y,z,E;t.parameters={...t.parameters,docs:{...(y=t.parameters)==null?void 0:y.docs,source:{originalSource:`{
  args: {
    label: 'Email',
    placeholder: 'Enter your email',
    error: 'Please enter a valid email address'
  }
}`,...(E=(z=t.parameters)==null?void 0:z.docs)==null?void 0:E.source}}};var S,$,C;n.parameters={...n.parameters,docs:{...(S=n.parameters)==null?void 0:S.docs,source:{originalSource:`{
  args: {
    label: 'Username',
    placeholder: 'Choose a username',
    success: 'Username is available!'
  }
}`,...(C=($=n.parameters)==null?void 0:$.docs)==null?void 0:C.source}}};var q,T,w;l.parameters={...l.parameters,docs:{...(q=l.parameters)==null?void 0:q.docs,source:{originalSource:`{
  args: {
    label: 'Disabled Input',
    placeholder: 'Cannot edit',
    disabled: true
  }
}`,...(w=(T=l.parameters)==null?void 0:T.docs)==null?void 0:w.source}}};var I,v,F;o.parameters={...o.parameters,docs:{...(I=o.parameters)==null?void 0:I.docs,source:{originalSource:`{
  args: {
    label: 'Required Field',
    placeholder: 'This field is required',
    required: true
  }
}`,...(F=(v=o.parameters)==null?void 0:v.docs)==null?void 0:F.source}}};var D,U,W;i.parameters={...i.parameters,docs:{...(D=i.parameters)==null?void 0:D.docs,source:{originalSource:`{
  render: () => {
    const container = document.createElement('div');
    container.style.cssText = 'display: flex; flex-direction: column; gap: 16px;';
    const sizes: Array<'sm' | 'md' | 'lg'> = ['sm', 'md', 'lg'];
    sizes.forEach(size => {
      container.appendChild(createInput({
        label: \`Size: \${size.toUpperCase()}\`,
        placeholder: 'Enter text',
        size
      }));
    });
    return container;
  }
}`,...(W=(U=i.parameters)==null?void 0:U.docs)==null?void 0:W.source}}};const A=["Default","WithHelperText","WithError","WithSuccess","Disabled","Required","Sizes"];export{a as Default,l as Disabled,o as Required,i as Sizes,t as WithError,s as WithHelperText,n as WithSuccess,A as __namedExportsOrder,k as default};
