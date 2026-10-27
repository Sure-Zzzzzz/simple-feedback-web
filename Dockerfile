FROM nginx:1.27-alpine
# 静态 dist 由 CI 构建产物挂载/复制进镜像；nginx 配置即本仓 deploy/nginx/feedback-web.conf
COPY deploy/nginx/feedback-web.conf /etc/nginx/conf.d/default.conf
COPY dist/ /usr/share/nginx/html/
EXPOSE 80
