FROM amazonlinux:2023
ARG CACHEBUST=2026-04-15-14-59-27

COPY plbase-install.sh python-requirements.txt /

RUN /bin/bash /plbase-install.sh

CMD [ "/bin/bash" ]
