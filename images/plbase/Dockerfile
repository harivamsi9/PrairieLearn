FROM amazonlinux:2023
ARG CACHEBUST=2026-10-15-17-55-45

COPY plbase-install.sh python-requirements.txt /

RUN /bin/bash /plbase-install.sh

CMD [ "/bin/bash" ]
