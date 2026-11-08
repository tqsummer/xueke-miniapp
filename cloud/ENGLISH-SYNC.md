# 英语账号同步：待部署验证

仅 `english_progress` 集合使用 `english-permissions.example.json` 示例，设置客户端 read/write 为 false。不要用此示例覆盖其他集合配置。云函数管理员 SDK 依靠代码校验访问。这里没有修改云控制台，也没有部署。

入口从 `cloud.getWXContext().OPENID` 获得可信身份，`sha256('english:'+openid).slice(0,32)` 作为文档 ID/accountId。客户端 body 不可指定 openid/owner；所有操作只绑定上下文用户。hash 是账号标识，不是访问凭据，必须依然验证 OPENID。

GET `/me/english/state`；POST `/me/english/sync` 和 `/me/english/import` 契约见 english.js。每次写入通过 `db.runTransaction` 读取/更新同一账号文档，返回完整 state。同步每批最多50事件，设备ID为1–64个ASCII字母数字/下划线/连字符，最多100设备；每设备seq从1开始严格连续，上限1e9。最近50事件保存短SHA256指纹并拒绝内容变化。更早已确认seq不再保留指纹，但总是忽略不再计分。客户端应保留失败批次和seq，在成功ack后才清除。

导入最多100个importId；相同importId幂等，已有wordId:mode永不覆盖。历史计数为非负整数 <=1e9，streak 0–5；时间合法毫秒整数。sync时间夹至服务端now且不早于该词last。导入未来last夹到now、due至多now+30天。到期复习间隔与前端一致。state.version每次有新事件或新导入时加1。服务器拒绝未知词ID/方向。

白名单 english-word-ids.json 从 data/english-days-1-2-preserved.json、3-16、17-30、31-44、45-60 五份数组生成，共1966词。更改词库时必须同步重新生成白名单，保留现有ID。

容量安全：3932条记录、100设备各50指纹、100个64字符importId 的最大字段值测试约691129字节（JSON），低于900000字节应用限制；为云文档结构开销留余量。该数值不是云端BSON实测。

本地执行：`node --test cloud/test/english.test.mjs cloud/test/core.test.mjs`。覆盖账号A/B隔离、无身份、伪造accountId/owner、非法事件、幂等重试、部分确认批次、序号缺口与冲突、事务回滚适配器、导入不覆盖、容量。SDK runTransaction 使用契约模拟测试，尚未在真实云数据库验证并发、权限、首次建文档和网络重试，需要微信开发者工具/测试环境完成后才可宣称生产可用。

现有语文接口及个人集合未改；仅 core.js 新增 `/me/english/` 分发，index.js 初始化独立集合和服务。没有删除接口，本任务不添加删除学习数据功能。
