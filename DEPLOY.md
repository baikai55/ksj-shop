# 一键部署速查

## 推荐：Vercel（3 分钟）

1. 代码推 GitHub  
2. https://vercel.com/new 导入  
3. 环境变量填 `KSJ_STORE_ID`  
4. Deploy  

## Cloudflare Pages

1. Workers & Pages → Create Pages → 连 Git  
2. Build output directory = `public`  
3. Build command 留空  
4. 环境变量填 `KSJ_STORE_ID`  
5. Deploy  

## 本地

```bash
npm install
npm start
```
