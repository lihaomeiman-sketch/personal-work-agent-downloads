"use strict";
(function () {
  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const CODE=/^[0-9a-f]{64}$/i;
  const OWNER=/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
  const REPO=/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
  function invitation(hash, expectedSite) {
    if (!hash || hash === "#") return {state:"none"};
    if (hash.length>1400) return {state:"invalid"};
    const params=new URLSearchParams(hash.replace(/^#/,""));
    const allowed=new Set(["site","invite","from","github"]);
    for (const key of params.keys()) if(!allowed.has(key)||params.getAll(key).length!==1)return {state:"invalid"};
    const site=params.get("site"),code=params.get("invite");
    if(!UUID.test(site||"")||!CODE.test(code||"")||(expectedSite&&site.toLowerCase()!==expectedSite.toLowerCase()))return {state:"invalid"};
    const recipient=params.get("github")||"";
    if(recipient&&!OWNER.test(recipient))return {state:"invalid"};
    return {state:"pending",site:site.toLowerCase(),code:code.toLowerCase(),from:(params.get("from")||"").slice(0,80),recipient};
  }
  function applicationLink(value) {
    if(value.state!=="pending"||!UUID.test(value.site||"")||!CODE.test(value.code||""))return null;
    return "personalagent://join#"+new URLSearchParams({site:value.site,invite:value.code}).toString();
  }
  function release(value) {
    if(!value||typeof value!=="object"||!UUID.test(value.site||"")||!/^\d+\.\d+\.\d+$/.test(value.version||"")||!Number.isInteger(value.build)||value.build<1||!/^\d+\.\d+\.\d+(?:-rc\.\d+)?$/.test(value.candidate||""))throw Error("发布信息需要重新核对。");
    if(value.sha256!==null&&!/^[0-9a-f]{64}$/.test(value.sha256||""))throw Error("安装包校验信息无效。");
    if(!OWNER.test(value.owner||"")||!REPO.test(value.repository||"")||value.repository.includes(".."))throw Error("发布地址无效。");
    if(value.archive!==null&&(!/^[A-Za-z0-9][A-Za-z0-9._-]*\.zip$/.test(value.archive||"")||value.archive.includes("..")))throw Error("安装包名称无效。");
    if(typeof value.links_enabled!=="boolean"||typeof value.owner_confirmed!=="boolean")throw Error("发布状态需要核对。");
    if(value.links_enabled&&(!value.owner_confirmed||!value.archive||!value.sha256))throw Error("下载地址尚未核实。");
    if(typeof value.developer_id_signed!=="boolean"||typeof value.notarized!=="boolean"||(value.notarized&&!value.developer_id_signed))throw Error("签名状态需要核对。");
    return value;
  }
  function downloadURL(value) {
    release(value);
    if(!value.links_enabled)return null;
    return "https://github.com/"+value.owner+"/"+value.repository+"/releases/download/"+encodeURIComponent(value.candidate)+"/"+encodeURIComponent(value.archive);
  }
  const core={invitation,applicationLink,release,downloadURL};
  if(typeof module!=="undefined"&&module.exports)module.exports=core;
  if(typeof document==="undefined")return;
  const $=id=>document.getElementById(id);
  const say=(id,message)=>{$(id).textContent=message;};
  let appLink=null;
  $("copy-invitation").onclick=async()=>{
    if(!appLink)return;
    try{await navigator.clipboard.writeText(appLink);say("feedback","应用邀请链接已复制，请只交给受邀本人。");}
    catch{say("feedback","剪贴板不可用；请保留本页，并在Mac上点击打开应用。");}
  };
  async function boot(){
    try{
      // Static, same-origin metadata only. Invitation/hash is never appended.
      const response=await fetch("./public-release.json",{cache:"no-store",credentials:"omit",referrerPolicy:"no-referrer"});
      if(!response.ok)throw Error("发布信息暂不可用，请稍后重新打开本页。");
      const info=release(await response.json());
      say("version",info.candidate+" · build "+info.build);
      say("platform","Apple Silicon Mac · macOS "+(info.minimum_macos||"14.0")+"及以上（以实际验证范围为准）");
      say("signature",info.notarized?"Developer ID签名，已公证（仍需安装验收）":info.developer_id_signed?"Developer ID签名，尚未公证":"候选临时签名，尚无Developer ID签名与公证");
      say("digest",info.sha256||"安装包尚未生成");
      const download=downloadURL(info);
      say("release-status",download?"当前为发布候选。下载后请核对版本和签名状态。":"发布准备中：此页和下载地址尚未最终发布，不能视作已经上线。");
      if(download){$("download").href=download;$("download").setAttribute("aria-disabled","false");say("download-note","下载来自GitHub Releases；本页不会在下载地址中附带邀请内容。");}
      else say("download-note",info.owner_confirmed?"下载链接尚未启用。":"GitHub发布账号及地址仍待最终核对。");
      const join=location.search?{state:"invalid"}:invitation(location.hash,info.site);
      if(join.state==="pending"){
        say("invitation-status","已读取邀请。有效期、撤回状态和受邀身份尚未核验，请在应用中登录后确认。");
        $("invitation-details").hidden=false;say("inviter",join.from||"未提供");say("recipient",join.recipient||"由应用核对当前登录账号");
        appLink=applicationLink(join);$("open-app").href=appLink;$("open-app").setAttribute("aria-disabled","false");$("copy-invitation").disabled=false;
      }else say("invitation-status",join.state==="none"?"当前没有邀请内容。请使用邀请方交给你的完整链接。":"邀请格式或项目服务不匹配。请向邀请方索取完整链接，本页不会尝试兑换。");
    }catch(error){say("release-status",error.message);say("invitation-status","尚未核对邀请，请稍后重新打开本页。");}
  }
  boot();
})();
