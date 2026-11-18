# 野外调查答卷的跳题路径与重复组采集

野外调查资料接收服务。按表单修订领取完整答卷：表单定义快照、路径记录、重复组实例与现场附件状态，并为资料员保留每份答卷的当前状态与变化依据。

## 运行

使用 Node.js 22，依赖由 package-lock.json 固定。安装后可执行：

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run demo
npm start
```

服务启动本地来源与收件接口，默认端口分别为4011和4010。`POST /collect` 按来源清单领取全部答卷；`GET /records`查看结构化记录全部版本，`GET /overview`查看每份答卷的当前状态与版本间变化依据，`GET /receipts`查看原文凭据，`GET /health`查看服务状态。`PORT`、`SOURCE_PORT`与`DATA_DIR`可分别设置端口和归档目录。

```sh
docker build -t field-form-paths .
docker run --rm --network none field-form-paths npm test
docker run --rm --network none field-form-paths npm run demo
docker run --rm -p 4010:4010 field-form-paths
```

## 答卷语义

每份记录以 `instanceId:formVersion:sourceRevision` 为标识，空值原样保留为 null，不填成空字符串。空白答案按路径记录区分三种含义：未提问（notAsked，当时跳题未展示）、提问未答（unanswered）、重复组实例被删除（deletedRepeats，附来源给出的删组标识）。跳题路径以来源当时的 askedPaths 为准，接收端不按新版表单重算旧答卷；记录内嵌当时表单修订的定义快照。重复组以 instanceKey 为身份，不按数组位置对齐两次调查的样方。附件可能晚于答卷上传：pending 或未登记都是"等资料"，只有来源明确 notCaptured 才表示没有拍照；取回的附件按字节摘要登记。

每份答卷当前状态：confirmed（结构已确认）、awaiting-data（等资料，如附件未到）、needs-review（需人工核对，如发生删组或附件异常）。`GET /overview` 由持久化记录推导，跨重启一致；同一实例相邻版本的变化依据（删组、答案变化、附件迁移）在 changes 中按实例键对齐给出。

## 资料组织

`provider/`是独立本地来源，`fixtures/`记录合成资料和来源阶段，`src/reader.mjs`负责按清单领取完整答卷并解释路径与附件状态，`src/lineage.mjs`由归档记录推导版本间变化依据与当前状态，`src/source.mjs`限定来源地址并记录响应字节，`src/archive.mjs`保存按摘要校验的原文与资料版本。`test/`覆盖收件语义、重复组身份、附件晚到、换版边界、跨重启继续接收、来源边界、原文完整性和服务联通。运行不依赖外网、数据库服务或真实设备。

完整来源约定见 `docs/source-contract.md`。项目只访问本地合成资料，不携带真实身份、密钥或业务数据。

## 快速查看

`npm run demo`启动实际来源和收件服务，先接收一次答卷（附件未到、状态为等资料），再模拟来源修订（删组、附件补齐）后二次接收，打印每份答卷当前状态与版本间变化依据，临时归档在退出时清理。正常完成时间小于90秒；需要保留数据时用`npm start`及独立`DATA_DIR`。演示反映当前产品能力，不代表全部来源资料已被接纳。
