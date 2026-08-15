FROM amazonlinux:2023
ARG CACHEBUST=2026-08-15-14-12-49

COPY plbase-install.sh python-requirements.txt /

RUN /bin/bash /plbase-install.sh

CMD [ "/bin/bash" ]
