FROM amazonlinux:2023
ARG CACHEBUST=2026-09-15-17-49-59

COPY plbase-install.sh python-requirements.txt /

RUN /bin/bash /plbase-install.sh

CMD [ "/bin/bash" ]
